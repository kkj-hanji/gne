import { mkdir, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const source = process.argv[2] || "https://appsc.gndec.ac.in/sites/default/files/2026-03/ss%20and%20Syllabus%20sem1%2C2%20Dec%202025%20unsigned.pdf";
const output = new URL("../public/data/first-year-syllabus-index.json", import.meta.url);

const response = await fetch(source);
if (!response.ok) throw new Error(`Unable to download syllabus PDF (HTTP ${response.status}).`);
const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), disableWorker: true }).promise;
const pages = [];
for (let number = 1; number <= pdf.numPages; number += 1) {
  const content = await (await pdf.getPage(number)).getTextContent();
  const rows = new Map();
  for (const item of content.items) {
    if (!item.str) continue;
    const y = Math.round((item.transform?.[5] || 0) * 10) / 10;
    const x = item.transform?.[4] || 0;
    rows.set(y, [...(rows.get(y) || []), { x, text: item.str }]);
  }
  const text = [...rows.entries()].sort(([a], [b]) => b - a)
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .join("\n").replace(/\s+/g, " ").trim();
  pages.push({ number, text });
}
await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify({ source, generatedAt: new Date().toISOString(), pages })}\n`);
console.log(`Indexed ${pages.length} syllabus pages.`);
