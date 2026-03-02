const els = {
  form: document.getElementById("invoiceForm"),
  businessName: document.getElementById("businessName"),
  businessAddress: document.getElementById("businessAddress"),
  billName: document.getElementById("billName"),
  billAddress: document.getElementById("billAddress"),
  invoiceNumber: document.getElementById("invoiceNumber"),
  invoiceDate: document.getElementById("invoiceDate"),
  dueDate: document.getElementById("dueDate"),
  currency: document.getElementById("currency"),
  additionalNotes: document.getElementById("additionalNotes"),
  paymentTerms: document.getElementById("paymentTerms"),
  instructionTitle: document.getElementById("instructionTitle"),
  bank: document.getElementById("bank"),
  accountName: document.getElementById("accountName"),
  accountNumber: document.getElementById("accountNumber"),
  contactEmail: document.getElementById("contactEmail"),
  primaryColor: document.getElementById("primaryColor"),
  primarySoftColor: document.getElementById("primarySoftColor"),
  headingColor: document.getElementById("headingColor"),
  textColor: document.getElementById("textColor"),
  mutedColor: document.getElementById("mutedColor"),
  borderColor: document.getElementById("borderColor"),
  tableHeaderColor: document.getElementById("tableHeaderColor"),
  alternateRowColor: document.getElementById("alternateRowColor"),
  totalBoxColor: document.getElementById("totalBoxColor"),
  itemsContainer: document.getElementById("itemsContainer"),
  itemTemplate: document.getElementById("itemTemplate"),
  addItemBtn: document.getElementById("addItemBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  resetBtn: document.getElementById("resetBtn"),
  importTemplateBtn: document.getElementById("importTemplateBtn"),
  exportTemplateBtn: document.getElementById("exportTemplateBtn"),
  importTemplateInput: document.getElementById("importTemplateInput"),
  statusText: document.getElementById("statusText"),
  subtotalPreview: document.getElementById("subtotalPreview"),
  presetButtons: document.querySelectorAll("[data-preset]"),
  previewWrap: document.getElementById("previewWrap"),
  previewPages: document.getElementById("previewPages")
};

const STYLE_PRESETS = {
  blue: {
    primaryColor: "#1E63E9",
    primarySoftColor: "#ECF3FF",
    headingColor: "#111827",
    textColor: "#253245",
    mutedColor: "#6B7A90",
    borderColor: "#D7DFEA",
    tableHeaderColor: "#F3F6FB",
    alternateRowColor: "#FBFCFF",
    totalBoxColor: "#EEF4FF"
  },
  teal: {
    primaryColor: "#0D9488",
    primarySoftColor: "#E8F8F5",
    headingColor: "#0F172A",
    textColor: "#334155",
    mutedColor: "#64748B",
    borderColor: "#DDE5ED",
    tableHeaderColor: "#F1F5F9",
    alternateRowColor: "#F8FAFC",
    totalBoxColor: "#EAF8F6"
  },
  slate: {
    primaryColor: "#334155",
    primarySoftColor: "#EEF2F8",
    headingColor: "#0F172A",
    textColor: "#1E293B",
    mutedColor: "#64748B",
    borderColor: "#D6DEE9",
    tableHeaderColor: "#F1F5F9",
    alternateRowColor: "#FAFCFF",
    totalBoxColor: "#EEF2F7"
  }
};

const BLANK_TEMPLATE = {
  business: {
    name: "",
    addressLines: []
  },
  billTo: {
    name: "",
    addressLines: []
  },
  invoice: {
    number: "",
    date: "",
    dueDate: "",
    currency: "USD"
  },
  items: [
    {
      name: "",
      description: "",
      quantity: 1,
      rate: 0
    }
  ],
  notes: {
    additionalNotes: "",
    paymentTerms: ""
  },
  payment: {
    instructionTitle: "",
    bank: "",
    accountName: "",
    accountNumber: ""
  },
  contact: {
    email: ""
  },
  style: { ...STYLE_PRESETS.blue }
};

let previewTimer = null;
let previewRequestCounter = 0;
let lastPreviewBytes = null;
let resizeTimer = null;

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function mergeDeep(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }

  const output = { ...base };

  Object.entries(override).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = value;
      return;
    }

    if (value && typeof value === "object") {
      output[key] = mergeDeep(base[key] || {}, value);
      return;
    }

    output[key] = value;
  });

  return output;
}

function sanitizeTemplate(input) {
  const merged = mergeDeep(BLANK_TEMPLATE, input || {});

  if (!Array.isArray(merged.items) || merged.items.length === 0) {
    merged.items = [{ name: "", description: "", quantity: 1, rate: 0 }];
  }

  return merged;
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function toIsoDate(dateString) {
  if (!dateString) {
    return "";
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const date = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
}

function formatDateForInvoice(dateInputValue) {
  if (!dateInputValue) {
    return "";
  }

  const parsed = new Date(`${dateInputValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parsed);
}

function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatAmount(amount, currency) {
  return `${Number(amount || 0).toFixed(2)} ${currency || "USD"}`;
}

function currencyText(amount) {
  const currency = (els.currency.value || "USD").trim() || "USD";
  return formatAmount(amount, currency);
}

function updateSubtotalPreview() {
  const subtotal = [...els.itemsContainer.querySelectorAll(".item-card")].reduce((total, card) => {
    const quantity = Number(card.querySelector('[data-field="quantity"]').value || 0);
    const rate = Number(card.querySelector('[data-field="rate"]').value || 0);
    return total + quantity * rate;
  }, 0);

  els.subtotalPreview.textContent = currencyText(subtotal);
}

function updateItemAmount(card) {
  const quantity = Number(card.querySelector('[data-field="quantity"]').value || 0);
  const rate = Number(card.querySelector('[data-field="rate"]').value || 0);
  card.querySelector('[data-field="amount"]').value = currencyText(quantity * rate);
}

function attachItemListeners(card) {
  const quantity = card.querySelector('[data-field="quantity"]');
  const rate = card.querySelector('[data-field="rate"]');
  const removeBtn = card.querySelector('[data-action="remove"]');

  const onAmountChange = () => {
    updateItemAmount(card);
    updateSubtotalPreview();
    queuePreview();
  };

  quantity.addEventListener("input", onAmountChange);
  rate.addEventListener("input", onAmountChange);
  card.querySelector('[data-field="name"]').addEventListener("input", queuePreview);
  card.querySelector('[data-field="description"]').addEventListener("input", queuePreview);

  removeBtn.addEventListener("click", () => {
    if (els.itemsContainer.children.length === 1) {
      return;
    }

    card.remove();
    updateSubtotalPreview();
    queuePreview();
  });

  updateItemAmount(card);
}

function createItemRow(item = {}) {
  const fragment = els.itemTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".item-card");

  card.querySelector('[data-field="name"]').value = item.name || "";
  card.querySelector('[data-field="quantity"]').value = item.quantity ?? 1;
  card.querySelector('[data-field="rate"]').value = item.rate ?? 0;
  card.querySelector('[data-field="description"]').value = item.description || "";

  attachItemListeners(card);
  els.itemsContainer.append(card);
}

function setStyleInputs(style) {
  els.primaryColor.value = style.primaryColor;
  els.primarySoftColor.value = style.primarySoftColor;
  els.headingColor.value = style.headingColor;
  els.textColor.value = style.textColor;
  els.mutedColor.value = style.mutedColor;
  els.borderColor.value = style.borderColor;
  els.tableHeaderColor.value = style.tableHeaderColor;
  els.alternateRowColor.value = style.alternateRowColor;
  els.totalBoxColor.value = style.totalBoxColor;
}

function applyTemplateToForm(rawTemplate) {
  const data = sanitizeTemplate(rawTemplate);

  els.businessName.value = data.business.name || "";
  els.businessAddress.value = (data.business.addressLines || []).join("\n");
  els.billName.value = data.billTo.name || "";
  els.billAddress.value = (data.billTo.addressLines || []).join("\n");
  els.invoiceNumber.value = data.invoice.number || "";
  els.invoiceDate.value = toIsoDate(data.invoice.date);
  els.dueDate.value = toIsoDate(data.invoice.dueDate);
  els.currency.value = data.invoice.currency || "USD";
  els.additionalNotes.value = data.notes.additionalNotes || "";
  els.paymentTerms.value = data.notes.paymentTerms || "";
  els.instructionTitle.value = data.payment.instructionTitle || "";
  els.bank.value = data.payment.bank || "";
  els.accountName.value = data.payment.accountName || "";
  els.accountNumber.value = data.payment.accountNumber || "";
  els.contactEmail.value = data.contact.email || "";

  setStyleInputs(data.style || STYLE_PRESETS.blue);

  els.itemsContainer.innerHTML = "";
  data.items.forEach((item) => createItemRow(item));

  updateSubtotalPreview();
}

function collectItems() {
  return [...els.itemsContainer.querySelectorAll(".item-card")].map((card) => ({
    name: card.querySelector('[data-field="name"]').value.trim(),
    description: card.querySelector('[data-field="description"]').value.trim(),
    quantity: Number(card.querySelector('[data-field="quantity"]').value || 0),
    rate: Number(card.querySelector('[data-field="rate"]').value || 0)
  }));
}

function payloadFromForm() {
  return {
    business: {
      name: els.businessName.value.trim(),
      addressLines: splitLines(els.businessAddress.value)
    },
    billTo: {
      name: els.billName.value.trim(),
      addressLines: splitLines(els.billAddress.value)
    },
    invoice: {
      number: els.invoiceNumber.value.trim(),
      date: formatDateForInvoice(els.invoiceDate.value),
      dueDate: formatDateForInvoice(els.dueDate.value),
      currency: (els.currency.value || "USD").trim() || "USD"
    },
    items: collectItems(),
    notes: {
      additionalNotes: els.additionalNotes.value,
      paymentTerms: els.paymentTerms.value
    },
    payment: {
      instructionTitle: els.instructionTitle.value,
      bank: els.bank.value,
      accountName: els.accountName.value,
      accountNumber: els.accountNumber.value
    },
    contact: {
      email: els.contactEmail.value
    },
    style: {
      primaryColor: els.primaryColor.value,
      primarySoftColor: els.primarySoftColor.value,
      headingColor: els.headingColor.value,
      textColor: els.textColor.value,
      mutedColor: els.mutedColor.value,
      borderColor: els.borderColor.value,
      tableHeaderColor: els.tableHeaderColor.value,
      alternateRowColor: els.alternateRowColor.value,
      totalBoxColor: els.totalBoxColor.value
    }
  };
}

async function fetchPdf(endpoint) {
  const payload = payloadFromForm();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.details || "Server error");
  }

  return { blob: await response.blob(), payload };
}

async function renderPdfToCanvases(pdfBytes) {
  const loadingTask = window.pdfjsLib.getDocument({ data: pdfBytes });
  const pdf = await loadingTask.promise;
  els.previewPages.innerHTML = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const containerWidth = Math.max(320, els.previewWrap.clientWidth - 24);
    const scale = containerWidth / unscaled.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.className = "preview-page-canvas";
    const context = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;
    els.previewPages.append(canvas);
  }

  return pdf.numPages;
}

async function updatePreview() {
  const requestId = ++previewRequestCounter;
  setStatus("Updating preview...");

  try {
    const { blob } = await fetchPdf("/api/preview");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    if (requestId !== previewRequestCounter) {
      return;
    }

    lastPreviewBytes = bytes;
    const pageCount = await renderPdfToCanvases(bytes);

    if (requestId === previewRequestCounter) {
      setStatus(`Preview synced with generated PDF (${pageCount} page${pageCount > 1 ? "s" : ""})`);
    }
  } catch (error) {
    setStatus(`Preview failed: ${error.message}`);
  }
}

function queuePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 350);
}

async function downloadPdf() {
  setStatus("Preparing download...");
  els.downloadBtn.disabled = true;

  try {
    const { blob, payload } = await fetchPdf("/api/generate");
    const url = URL.createObjectURL(blob);
    const filename = `${payload.invoice.number || "invoice"}.pdf`;

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    URL.revokeObjectURL(url);
    setStatus("PDF downloaded");
  } catch (error) {
    setStatus(`Download failed: ${error.message}`);
  } finally {
    els.downloadBtn.disabled = false;
  }
}

function exportTemplateJson() {
  const payload = payloadFromForm();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "invoice-template.json";
  anchor.click();

  URL.revokeObjectURL(url);
  setStatus("Template exported");
}

async function importTemplateJson(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    applyTemplateToForm(parsed);
    queuePreview();
    setStatus("Template imported");
  } catch (error) {
    setStatus(`Import failed: ${error.message}`);
  }
}

function bindMainFormEvents() {
  els.form.addEventListener("input", (event) => {
    if (event.target.closest(".item-card")) {
      return;
    }

    if (event.target.id === "currency") {
      [...els.itemsContainer.querySelectorAll(".item-card")].forEach((card) => updateItemAmount(card));
      updateSubtotalPreview();
    }

    queuePreview();
  });

  els.form.addEventListener("change", queuePreview);
}

function applyPreset(name) {
  const preset = STYLE_PRESETS[name];
  if (!preset) {
    return;
  }

  setStyleInputs(preset);
  queuePreview();
}

function wireActions() {
  els.addItemBtn.addEventListener("click", () => {
    createItemRow();
    updateSubtotalPreview();
    queuePreview();
  });

  els.downloadBtn.addEventListener("click", downloadPdf);
  els.exportTemplateBtn.addEventListener("click", exportTemplateJson);

  els.importTemplateBtn.addEventListener("click", () => {
    els.importTemplateInput.click();
  });

  els.importTemplateInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    await importTemplateJson(file);
    event.target.value = "";
  });

  els.resetBtn.addEventListener("click", () => {
    applyTemplateToForm(BLANK_TEMPLATE);
    queuePreview();
    setStatus("Form reset");
  });

  els.presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(async () => {
      if (!lastPreviewBytes) {
        return;
      }

      await renderPdfToCanvases(lastPreviewBytes);
    }, 180);
  });
}

async function init() {
  try {
    if (!window.pdfjsLib) {
      throw new Error("PDF renderer failed to load");
    }

    applyTemplateToForm(BLANK_TEMPLATE);
    bindMainFormEvents();
    wireActions();
    await updatePreview();
  } catch (error) {
    setStatus(`Failed to initialize: ${error.message}`);
  }
}

init();
