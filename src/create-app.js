const express = require("express");
const { defaultData, generateInvoiceBuffer, normalizeInvoiceData } = require("./invoice-generator");

function createApp(staticDir) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  if (staticDir) {
    app.use(express.static(staticDir));
  }

  app.get("/api/default-data", (req, res) => {
    res.json(defaultData);
  });

  async function renderPdfResponse(req, res, { download }) {
    try {
      const data = normalizeInvoiceData(req.body || {});
      const buffer = await generateInvoiceBuffer(data);

      const rawName = (data.invoice && data.invoice.number) || "invoice";
      const safeName = String(rawName).replace(/[^a-zA-Z0-9-_]/g, "_");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename="${safeName}.pdf"`
      );
      res.send(buffer);
    } catch (error) {
      res.status(400).json({
        message: "Failed to generate invoice",
        details: error.message
      });
    }
  }

  app.post("/api/preview", async (req, res) => {
    await renderPdfResponse(req, res, { download: false });
  });

  app.post("/api/generate", async (req, res) => {
    await renderPdfResponse(req, res, { download: true });
  });

  return app;
}

module.exports = { createApp };
