import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const file = "C:/Users/HP/Downloads/Seating Plan For PPS MSE-II Nov 2026.pdf";
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
console.log("pages", doc.numPages);
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  const rows = [];
  for (const item of content.items) {
    const value = String(item.str || "").trim();
    if (!value) continue;
    const x = Number(item.transform?.[4]) || 0;
    const y = Number(item.transform?.[5]) || 0;
    let row = rows.find(r => Math.abs(r.y - y) < 1.25);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, value });
  }
  console.log("=== PAGE", p, "===");
  for (const row of rows.sort((a,b)=>b.y-a.y)) {
    console.log(row.items.sort((a,b)=>a.x-b.x).map(i=>i.value).join(" | "));
  }
}
