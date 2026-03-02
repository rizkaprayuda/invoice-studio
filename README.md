# Invoice Studio (Node.js)

A customizable invoice PDF generator with a web editor and 1:1 live PDF preview.

## Features

- Fully web-based invoice editor
- 1:1 live preview from the same PDF engine used for download
- Add/remove invoice items with instant subtotal updates
- Theme presets + manual color controls
- Export form data to JSON template
- Import JSON template to refill the form
- Download final invoice as PDF

## Run Web App

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000`

## CLI Mode (Optional)

Generate using JSON file:

```bash
node src/generate-invoice.js --input ./examples/invoice-data.json --output ./output/invoice.pdf
```

## JSON Data Structure

Main fields:

- `business`
- `billTo`
- `invoice`
- `items`
- `notes`
- `payment`
- `contact`
- `style`

You can use the in-app `Export JSON` button to create your own template, edit it, then load it back with `Import JSON`.
