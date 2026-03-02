#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { defaultData, loadInputData, generateInvoiceToFile } = require("./invoice-generator");

function parseArgs(argv) {
  const args = { input: null, output: null };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if ((token === "--input" || token === "-i") && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
      continue;
    }

    if ((token === "--output" || token === "-o") && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return args;
}

function resolveOutputPath(rawOutputPath, invoiceNumber) {
  if (rawOutputPath) {
    return path.resolve(rawOutputPath);
  }

  return path.resolve(process.cwd(), "output", `invoice-${invoiceNumber}.pdf`);
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  const data = input ? loadInputData(input) : defaultData;

  const invoiceNumber = data.invoice.number || "document";
  const outputPath = resolveOutputPath(output, invoiceNumber);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await generateInvoiceToFile(data, outputPath);
  // eslint-disable-next-line no-console
  console.log(`Invoice generated: ${outputPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to generate invoice:", error.message);
  process.exit(1);
});
