import * as Print from "expo-print";
import QRCode from "qrcode";
import { Platform } from "react-native";
import { IndividualLabelData } from "../types"; // Assuming IndividualLabelData is defined in types/index.tsx

export const printLabels = async (labelsToPrint: IndividualLabelData[]) => {
  // A4 dimensions: 210mm x 297mm
  // We want to fit 20 labels (e.g., 4 columns x 5 rows) on an A4 page.
  // Each label will be approximately 45mm x 50mm (allowing for margins and gaps).
  const labelHtmlPromises = labelsToPrint.map(async (label) => {
    const svgString = await QRCode.toString(label.sku, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 1,
    });

    return `
      <div class="label-item">
        <div class="label-content">
          <div class="qr-code-container">${svgString}</div>
          <p class="label-sku-date">SKU: ${label.sku} | ${label.dateAdded}</p>
        </div>
      </div>
    `;
  });

  const allLabelsHtml = (await Promise.all(labelHtmlPromises)).join("");

  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 10mm; /* Overall padding for the A4 sheet */
            box-sizing: border-box;
            display: grid;
            grid-template-columns: repeat(4, 1fr); /* 4 columns */
            grid-template-rows: repeat(5, 1fr); /* 5 rows */
            gap: 5mm; /* Gap between labels */
            height: 277mm; /* A4 height - 2*padding */
            width: 190mm; /* A4 width - 2*padding */
            /* Ensure content fits within A4 and handles multiple pages */
            page-break-after: auto; /* Allow pages to break naturally */
          }
          .label-container {
            /* This class is no longer used directly for individual labels in the new grid layout */
          }
          .label-item {
            display: flex;
            justify-content: center;
            align-items: center;
            border: 0.25mm dashed #ccc; /* Thin cutter line */
            box-sizing: border-box;
            padding: 2mm; /* Inner padding for content */
            text-align: center;
            overflow: hidden; /* Ensure content doesn't spill */
          }
          .label-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-around;
            align-items: center;
          }
          .label-header {
            font-size: 10pt;
            margin: 0;
            text-transform: uppercase;
            font-weight: bold;
          }
          .label-wine-name {
            font-size: 8pt;
            margin: 2pt 0;
            font-weight: 500;
            line-height: 1.2;
            max-height: 2.4em; /* Limit to 2 lines */
            overflow: hidden;
          }
          .label-sku-date {
            font-size: 7pt;
            font-weight: normal;
            color: #555;
            margin: 0;
          }
          h1 {
            /* Overridden by .label-header */
          }
          .qr-code-container {
            width: 30mm;
            height: 30mm;
            margin-top: 5pt;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-code-container svg {
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        ${allLabelsHtml}
      </body>
    </html>
  `;

  try {
    await Print.printAsync({
      html,
      printerUrl: Platform.OS === "ios" ? undefined : undefined, // Assuming default or user-selected printer
    });
  } catch (error) {
    console.error("Error printing labels:", error);
    throw error;
  }
};
