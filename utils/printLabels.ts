import * as Print from "expo-print";
import QRCode from "qrcode";
import { IndividualLabelData } from "../types";

export const printLabels = async (labelsToPrint: IndividualLabelData[]) => {
  const labelHtmlPromises = labelsToPrint.map(async (label) => {
    const svgString = await QRCode.toString(label.bottleId, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 1,
    });

    return `
      <div class="label-item">
        <div class="label-content">
          <div class="label-wine-name"><span>${label.wineName}</span></div>
          <div class="qr-code-container">${svgString}</div>
          <div class="label-footer">
            <p class="label-sku-date">SKU: ${label.sku}</p>
          </div>
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
            margin: 10mm;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: grid;
            grid-template-columns: repeat(4, 47.5mm); 
            grid-template-rows: repeat(5, 55.4mm); 
            border-top: .4mm dashed #bbb;
            border-left: .4mm dashed #bbb;
            width: fit-content;
          }
          .label-item {
            display: flex;
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
            padding: 3mm;
            text-align: center;
            overflow: hidden;
            border-right: .4mm dashed #bbb;
            border-bottom: .4mm dashed #bbb;
          }
          .label-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center; /* Center everything as a group */
            align-items: center;
          }
          .label-wine-name {
            flex: 1; /* Takes up all remaining top space dynamically */
            width: 100%;
            display: flex;
            align-items: center; /* Vertically centers the text */
            justify-content: center;
            overflow: hidden;
          }
          .label-wine-name span {
            font-size: 7pt; /* Scaled to fit long words */
            font-weight: bold;
            line-height: 1.1;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2; /* Safely allow up to 4 lines now */
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .qr-code-container {
            width: 35mm; /* Scaled down to guarantee text room */
            height: 35mm;
            flex-shrink: 0; /* Prevents the QR code from squishing */
            margin: 1.5mm 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-code-container svg {
            width: 100%;
            height: 100%;
          }
          .label-footer {
            flex-shrink: 0; /* Ensures footer never squishes */
            width: 100%;
          }
          .label-sku-date {
            font-size: 7pt;
            color: #444;
            margin: 0;
            line-height: 1.2;
          }
          
          .label-item:nth-child(20n) {
            page-break-after: always;
          }
        </style>
      </head>
      <body>
        ${allLabelsHtml}
      </body>
    </html>
  `;

  try {
    await Print.printAsync({ html });
  } catch (error) {
    console.error("Error printing labels:", error);
    throw error;
  }
};
