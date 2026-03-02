const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const defaultData = require("./sample-invoice-data");

const PAGE_MARGIN = 44;
const MIN_SECTION_GAP = 18;

function mergeDeep(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }

  const out = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      out[key] = value;
      continue;
    }

    if (value && typeof value === "object") {
      out[key] = mergeDeep(base[key] || {}, value);
      continue;
    }

    out[key] = value;
  }

  return out;
}

function normalizeInvoiceData(inputData = {}) {
  const merged = mergeDeep(defaultData, inputData);

  if (!Array.isArray(merged.items) || merged.items.length === 0) {
    merged.items = [{ name: "Service", description: "", quantity: 1, rate: 0 }];
  }

  return merged;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAmount(value, currency) {
  return `${numeric(value).toFixed(2)} ${currency}`;
}

function formatRate(value, currency) {
  const amount = numeric(value);
  const label = Number.isInteger(amount) ? `${amount}` : amount.toFixed(2);
  return `${label} ${currency}`;
}

function pageWidth(doc) {
  return doc.page.width;
}

function pageHeight(doc) {
  return doc.page.height;
}

function contentWidth(doc) {
  return pageWidth(doc) - PAGE_MARGIN * 2;
}

function pageBottom(doc) {
  return pageHeight(doc) - PAGE_MARGIN;
}

function drawPageBackground(doc) {
  doc.save();
  doc.rect(0, 0, pageWidth(doc), pageHeight(doc)).fill("#FFFFFF");
  doc.restore();
}

function ensureSpace(doc, y, neededHeight, onPageBreak) {
  if (y + neededHeight <= pageBottom(doc)) {
    return y;
  }

  doc.addPage();
  return onPageBreak ? onPageBreak() : PAGE_MARGIN;
}

function drawTopSection(doc, data, style) {
  const topHeight = 170;
  const width = pageWidth(doc);

  doc.save();
  doc.rect(0, 0, width, topHeight).fill(style.primarySoftColor);

  doc.circle(width - 70, 50, 48).fillOpacity(0.16).fill(style.primaryColor);
  doc.circle(width - 118, 22, 22).fillOpacity(0.1).fill(style.primaryColor);
  doc.restore();

  const leftX = PAGE_MARGIN;
  const rightX = width - PAGE_MARGIN;

  doc.fillColor(style.primaryColor).font("Helvetica-Bold").fontSize(25).text(data.business.name, leftX, 38, {
    width: width * 0.58
  });

  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(36).text("Invoice #", 0, 34, {
    width: rightX - 8,
    align: "right"
  });

  doc.fillColor(style.mutedColor).font("Helvetica-Bold").fontSize(14).text(data.invoice.number, 0, 79, {
    width: rightX,
    align: "right"
  });

  let addressY = 110;
  for (const line of data.business.addressLines || []) {
    doc.fillColor(style.textColor).font("Helvetica").fontSize(10.5).text(line, 0, addressY, {
      width: rightX,
      align: "right"
    });
    addressY += 14;
  }

  return topHeight + 18;
}

function drawPartyAndDates(doc, data, style, y) {
  const width = contentWidth(doc);
  const leftX = PAGE_MARGIN;
  const leftCardWidth = width * 0.57;
  const rightCardWidth = width - leftCardWidth - 14;
  const rightCardX = leftX + leftCardWidth + 14;
  const cardHeight = 104;

  doc.roundedRect(leftX, y, leftCardWidth, cardHeight, 8).lineWidth(1).fillAndStroke("#FFFFFF", style.borderColor);
  doc.roundedRect(rightCardX, y, rightCardWidth, cardHeight, 8).lineWidth(1).fillAndStroke("#FFFFFF", style.borderColor);

  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(15).text("Bill to:", leftX + 14, y + 16);
  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(20).text(data.billTo.name, leftX + 14, y + 40, {
    width: leftCardWidth - 24
  });

  let billY = y + 69;
  for (const line of data.billTo.addressLines || []) {
    doc.fillColor(style.mutedColor).font("Helvetica").fontSize(11).text(line, leftX + 14, billY, {
      width: leftCardWidth - 24
    });
    billY += 15;
  }

  const dateLabelX = rightCardX + 14;
  const dateValueX = rightCardX + rightCardWidth * 0.5;

  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(12).text("Invoice date:", dateLabelX, y + 35);
  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(12).text("Due date:", dateLabelX, y + 60);

  doc.fillColor(style.mutedColor).font("Helvetica").fontSize(12).text(data.invoice.date, dateValueX, y + 35, {
    width: rightCardWidth * 0.45,
    align: "right"
  });
  doc.fillColor(style.mutedColor).font("Helvetica").fontSize(12).text(data.invoice.dueDate, dateValueX, y + 60, {
    width: rightCardWidth * 0.45,
    align: "right"
  });

  return y + cardHeight + MIN_SECTION_GAP;
}

function drawItemsTableHeader(doc, style, y) {
  const x = PAGE_MARGIN;
  const width = contentWidth(doc);

  doc.roundedRect(x, y, width, 30, 6).fill(style.tableHeaderColor);

  const columns = {
    item: x + 10,
    qty: x + width * 0.48,
    rate: x + width * 0.62,
    amount: x + width * 0.8
  };

  doc.fillColor(style.mutedColor).font("Helvetica-Bold").fontSize(10)
    .text("ITEM", columns.item, y + 10)
    .text("QTY", columns.qty, y + 10)
    .text("RATE", columns.rate, y + 10)
    .text("AMOUNT", columns.amount, y + 10, { width: width * 0.18, align: "right" });

  return { nextY: y + 34, columns };
}

function drawItemsTable(doc, data, style, y) {
  const width = contentWidth(doc);
  const currency = data.invoice.currency || "USD";
  let subtotal = 0;
  let rowY = y;

  const header = drawItemsTableHeader(doc, style, rowY);
  rowY = header.nextY;

  for (let i = 0; i < data.items.length; i += 1) {
    const item = data.items[i];
    const amount = numeric(item.quantity) * numeric(item.rate);
    subtotal += amount;

    const itemTitleHeight = doc.heightOfString(item.name || "-", {
      width: width * 0.46 - 12
    });

    const itemDescHeight = item.description
      ? doc.heightOfString(item.description, {
          width: width * 0.46 - 12
        })
      : 0;

    const rowHeight = Math.max(42, 14 + itemTitleHeight + (item.description ? itemDescHeight + 2 : 0));

    rowY = ensureSpace(doc, rowY, rowHeight + 95, () => {
      drawPageBackground(doc);
      doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(16).text(`Invoice #${data.invoice.number} (continued)`, PAGE_MARGIN, PAGE_MARGIN);
      const continuedHeader = drawItemsTableHeader(doc, style, PAGE_MARGIN + 28);
      return continuedHeader.nextY;
    });

    if (i % 2 === 1) {
      doc.rect(PAGE_MARGIN, rowY, width, rowHeight).fill(style.alternateRowColor);
    }

    doc.moveTo(PAGE_MARGIN, rowY + rowHeight).lineTo(PAGE_MARGIN + width, rowY + rowHeight).lineWidth(1).strokeColor(style.borderColor).stroke();

    doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(13).text(item.name || "-", PAGE_MARGIN + 10, rowY + 10, {
      width: width * 0.46 - 12
    });

    if (item.description) {
      doc.fillColor(style.mutedColor).font("Helvetica").fontSize(10.5).text(item.description, PAGE_MARGIN + 10, rowY + 28, {
        width: width * 0.46 - 12
      });
    }

    doc.fillColor(style.textColor).font("Helvetica").fontSize(12)
      .text(`${numeric(item.quantity)}`, PAGE_MARGIN + width * 0.48, rowY + 14)
      .text(formatRate(item.rate, currency), PAGE_MARGIN + width * 0.62, rowY + 14)
      .text(formatAmount(amount, currency), PAGE_MARGIN + width * 0.8, rowY + 14, {
        width: width * 0.18,
        align: "right"
      });

    rowY += rowHeight;
  }

  return {
    subtotal,
    total: subtotal,
    currency,
    y: rowY + MIN_SECTION_GAP
  };
}

function drawTotals(doc, summary, style, y) {
  const boxWidth = 235;
  const x = pageWidth(doc) - PAGE_MARGIN - boxWidth;
  const boxHeight = 76;

  doc.roundedRect(x, y, boxWidth, boxHeight, 8).fill(style.totalBoxColor);

  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(13).text("Subtotal:", x + 14, y + 18);
  doc.fillColor(style.mutedColor).font("Helvetica-Bold").fontSize(14).text(formatAmount(summary.subtotal, summary.currency), x + 14, y + 18, {
    width: boxWidth - 24,
    align: "right"
  });

  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(16).text("Total:", x + 14, y + 44);
  doc.fillColor(style.mutedColor).font("Helvetica-Bold").fontSize(18).text(formatAmount(summary.total, summary.currency), x + 14, y + 42, {
    width: boxWidth - 24,
    align: "right"
  });

  return y + boxHeight + 20;
}

function drawNotes(doc, data, style, y) {
  doc.fillColor(style.primaryColor).font("Helvetica-Bold").fontSize(14).text("Additional notes:", PAGE_MARGIN, y);

  const additionalNotes = data.notes.additionalNotes && data.notes.additionalNotes.trim().length > 0
    ? data.notes.additionalNotes
    : "-";

  doc.fillColor(style.textColor).font("Helvetica").fontSize(11).text(additionalNotes, PAGE_MARGIN, y + 18, {
    width: contentWidth(doc)
  });

  const paymentTermsY = y + 44;

  doc.fillColor(style.primaryColor).font("Helvetica-Bold").fontSize(14).text("Payment terms:", PAGE_MARGIN, paymentTermsY);
  doc.fillColor(style.textColor).font("Helvetica").fontSize(13).text(data.notes.paymentTerms || "-", PAGE_MARGIN, paymentTermsY + 18);

  return paymentTermsY + 42;
}

function drawPaymentDetails(doc, data, style, y) {
  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(16).text(data.payment.instructionTitle || "Please send the payment to this address", PAGE_MARGIN, y);

  const textY = y + 26;
  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(11.5).text(`Bank: ${data.payment.bank || "-"}`, PAGE_MARGIN, textY);
  doc.text(`Account name: ${data.payment.accountName || "-"}`, PAGE_MARGIN, textY + 16);
  doc.text(`Account no: ${data.payment.accountNumber || "-"}`, PAGE_MARGIN, textY + 32);

  return textY + 54;
}

function drawContact(doc, data, style, y) {
  doc.fillColor(style.mutedColor).font("Helvetica").fontSize(11).text(
    "If you have any questions concerning this invoice, use the following contact information:",
    PAGE_MARGIN,
    y,
    { width: contentWidth(doc) }
  );

  doc.fillColor(style.headingColor).font("Helvetica-Bold").fontSize(11.5).text(data.contact.email || "-", PAGE_MARGIN, y + 18);
}

function buildStyles(data) {
  return {
    primaryColor: data.style.primaryColor,
    primarySoftColor: data.style.primarySoftColor,
    headingColor: data.style.headingColor,
    textColor: data.style.textColor,
    mutedColor: data.style.mutedColor,
    borderColor: data.style.borderColor,
    tableHeaderColor: data.style.tableHeaderColor,
    alternateRowColor: data.style.alternateRowColor,
    totalBoxColor: data.style.totalBoxColor
  };
}

function drawInvoice(doc, rawData) {
  const data = normalizeInvoiceData(rawData);
  const style = buildStyles(data);

  drawPageBackground(doc);
  let cursorY = drawTopSection(doc, data, style);
  cursorY = drawPartyAndDates(doc, data, style, cursorY);

  const summary = drawItemsTable(doc, data, style, cursorY);
  cursorY = drawTotals(doc, summary, style, summary.y);

  cursorY = ensureSpace(doc, cursorY, 165, () => {
    drawPageBackground(doc);
    return PAGE_MARGIN;
  });
  cursorY = drawNotes(doc, data, style, cursorY);

  cursorY = ensureSpace(doc, cursorY, 85, () => {
    drawPageBackground(doc);
    return PAGE_MARGIN;
  });
  cursorY = drawPaymentDetails(doc, data, style, cursorY);

  cursorY = ensureSpace(doc, cursorY, 55, () => {
    drawPageBackground(doc);
    return PAGE_MARGIN;
  });
  drawContact(doc, data, style, cursorY);

  return data;
}

function generateInvoiceToFile(rawData, outputPath) {
  const doc = new PDFDocument({ size: "A4", margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN } });
  const output = fs.createWriteStream(outputPath);

  doc.pipe(output);
  drawInvoice(doc, rawData);
  doc.end();

  return new Promise((resolve, reject) => {
    output.on("finish", () => resolve(outputPath));
    output.on("error", reject);
  });
}

function generateInvoiceBuffer(rawData) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN } });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawInvoice(doc, rawData);
    doc.end();
  });
}

function loadInputData(inputPath) {
  const absoluteInputPath = path.resolve(inputPath);
  const raw = fs.readFileSync(absoluteInputPath, "utf8");
  return normalizeInvoiceData(JSON.parse(raw));
}

module.exports = {
  defaultData,
  normalizeInvoiceData,
  loadInputData,
  generateInvoiceBuffer,
  generateInvoiceToFile
};
