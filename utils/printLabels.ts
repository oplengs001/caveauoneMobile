import * as Print from 'expo-print';
import { Platform } from 'react-native';

export const printLabels = async (wineName: string, quantity: number, dateStr: string) => {
  // A simple HTML template mimicking a sticker label with a placeholder QR code
  const html = `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          @page { margin: 0; }
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            text-align: center;
            padding: 20px;
          }
          .label-container {
            border: 2px dashed #000;
            padding: 20px;
            width: 300px;
            margin: 0 auto;
            margin-bottom: 20px;
            page-break-after: always;
          }
          h1 {
            font-size: 24px;
            margin: 0 0 10px 0;
            text-transform: uppercase;
          }
          .sku {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
          }
          .qr-placeholder {
            width: 150px;
            height: 150px;
            background-color: #eee;
            border: 4px solid #000;
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        ${Array.from({ length: quantity }).map(() => `
          <div class="label-container">
            <h1>CAVEAU ONE</h1>
            <div class="sku">KONG | ${wineName.substring(0, 10).toUpperCase()} | ${dateStr}</div>
            <div class="qr-placeholder">
              [QR CODE]
            </div>
          </div>
        `).join('')}
      </body>
    </html>
  `;

  try {
    await Print.printAsync({
      html,
      printerUrl: Platform.OS === 'ios' ? undefined : undefined, // Assuming default or user-selected printer
    });
  } catch (error) {
    console.error('Error printing labels:', error);
    throw error;
  }
};
