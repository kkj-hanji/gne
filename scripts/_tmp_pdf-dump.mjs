import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const target = process.argv[2];
const data = new Uint8Array(await readFile(target));
const pdf = await getDocument({ data, disableWorker: true }).promise;
for (let number = 1; number <= pdf.numPages; number += 1) {
  const content = await (await pdf.getPage(number)).getTextContent();
  const rows = new Map();
  for (const item of content.items) {
    if (!item.str) continue;
    const y = Math.round((item.transform?.[5] || 0) * 10) / 10;
    rows.set(y, [...(rows.get(y) || []), { x: item.transform?.[4] || 0, text: item.str }]);
  }
  const text = [...rows.entries()].sort(([a], [b]) => b - a)
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.text).join(" "))
    .join("\n");
  console.log(`\n===== PAGE ${number} =====`);
  console.log(text.trim());
}
