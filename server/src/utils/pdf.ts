import puppeteer from 'puppeteer';

let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  return browser;
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export interface AssetRegisterRow {
  assetNumber: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: string;
  residualValue: string;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDepreciation: string;
  bookValue: string;
  status: string;
}

export function buildAssetRegisterHtml(companyName: string, rows: AssetRegisterRow[], generatedAt: string): string {
  const rowsHtml = rows.map(r => `
    <tr>
      <td>${r.assetNumber}</td>
      <td>${r.name}</td>
      <td>${r.category || '—'}</td>
      <td>${r.acquisitionDate}</td>
      <td style="text-align:right">${r.acquisitionCost}</td>
      <td style="text-align:right">${r.residualValue}</td>
      <td style="text-align:center">${r.usefulLifeMonths}</td>
      <td style="text-align:center">${r.depreciationMethod}</td>
      <td style="text-align:right">${r.accumulatedDepreciation}</td>
      <td style="text-align:right;font-weight:600">${r.bookValue}</td>
      <td style="text-align:center">${r.status}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #222; margin: 0; }
    h1 { font-size: 14pt; color: #1976d2; margin: 0 0 4px 0; }
    .meta { font-size: 8pt; color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1976d2; color: #fff; padding: 5px 6px; text-align: left; font-size: 8pt; white-space: nowrap; }
    td { padding: 4px 6px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
    tr:nth-child(even) { background: #f5f8fe; }
    .footer { margin-top: 20px; font-size: 8pt; color: #888; text-align: right; }
    @page { margin: 15mm; }
  </style>
  </head><body>
  <h1>${companyName} — Anlagenregister</h1>
  <div class="meta">Erstellt am ${generatedAt} · ${rows.length} Anlagegüter</div>
  <table>
    <thead><tr>
      <th>Nr.</th><th>Bezeichnung</th><th>Kategorie</th>
      <th>Anschaffung</th><th style="text-align:right">AK (€)</th>
      <th style="text-align:right">Restwert (€)</th>
      <th style="text-align:center">ND (Mon.)</th>
      <th style="text-align:center">Methode</th>
      <th style="text-align:right">Kum. AfA (€)</th>
      <th style="text-align:right">Buchwert (€)</th>
      <th style="text-align:center">Status</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">OrgX ERP · Anlagenregister</div>
  </body></html>`;
}
