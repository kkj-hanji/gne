import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseSeatingPlanText, inferSeatingPlanMetadata, selectSeatingPlanForExam, selectSeatingPlan } from "../next/engine/seating.js";
import { TRANSCRIBED_EXAMS } from "../next/engine/exams.js";

const file = "C:/Users/HP/Downloads/Seating Plan For PPS MSE-II Nov 2026.pdf";
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
const pages = [], layout = [];
function pageTextLines(items) {
  const rows = [], positionedItems = [];
  for (const item of items || []) {
    const value = String(item?.str || "").trim();
    if (!value) continue;
    const x = Number(item.transform?.[4]) || 0;
    const y = Number(item.transform?.[5]) || 0;
    positionedItems.push({ x, y, width: Number(item.width) || 0, value });
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 1.25);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push({ x, value });
  }
  return { text: rows.sort((a,b)=>b.y-a.y).map((row)=>row.items.sort((a,b)=>a.x-b.x).map((item)=>item.value).join(" ")).join("\n"), layout: positionedItems };
}
for (let p=1;p<=doc.numPages;p++){ const page=await doc.getPage(p); const c=await page.getTextContent(); const e=pageTextLines(c.items); pages.push(e.text); layout.push(e.layout); page.cleanup(); }
const extracted = { text: pages.join("\n\n"), pages: pages.length, layout };
const parsed = parseSeatingPlanText(extracted.text, { layout: extracted.layout });
console.log("pages", extracted.pages, "ok", parsed.ok, "rooms", parsed.rooms, "seats", parsed.seats.length);
console.log("warnings", parsed.warnings);
console.log("meta", inferSeatingPlanMetadata("Seating Plan For PPS MSE-II Nov 2026.pdf", TRANSCRIBED_EXAMS));
console.log("first seats", parsed.seats.slice(0,5));
console.log("last seats", parsed.seats.slice(-5));
const byRoom = {};
for (const s of parsed.seats) byRoom[s.room]=(byRoom[s.room]||0)+1;
console.log(byRoom);
