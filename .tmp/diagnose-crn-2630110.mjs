import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseSeatingPlanText } from "../next/engine/seating.js";

const target = "2630110";
const roster = JSON.parse(fs.readFileSync("public/data/student-roster-index.json", "utf8"));
const student = roster.records?.find((entry) => entry?.crn === target);
console.log(JSON.stringify({ rosterMatch: Boolean(student), branch: student?.branch || "", section: student?.section || "", subsection: student?.subsection || "" }));
const inputs = [
  ["EDG Shift 1 (ME/CE/RAI)", "C:/Users/HP/Downloads/Seating Plan For EDG exam SHIFT 1(ME,CE,RAI) MSE 2.pdf", "seat-2026-11-28-edg-engineering-drawing-1100-1230"],
  ["EDG Shift 2 (EE/EC)", "C:/Users/HP/Downloads/Seating Plan For EDG exam SHIFT 2(EE,EC) MSE 2.pdf", "seat-2026-11-28-edg-engineering-drawing-1300-1430"]
];

async function parsePdf(path) {
  if (!fs.existsSync(path)) return { exists: false };
  const data = new Uint8Array(fs.readFileSync(path));
  const document = await getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  const layoutPages = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const lines = [];
      const layout = [];
      for (const item of content.items || []) {
        const value = String(item?.str || "").trim();
        if (!value) continue;
        const y = Number(item.transform?.[5]) || 0;
        const x = Number(item.transform?.[4]) || 0;
        layout.push({ x, y, width: Number(item.width) || 0, value });
        let line = lines.find((entry) => Math.abs(entry.y - y) < 1.25);
        if (!line) { line = { y, items: [] }; lines.push(line); }
        line.items.push({ x, value });
      }
      pages.push(lines.sort((a, b) => b.y - a.y).map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.value).join(" ")).join("\n"));
      layoutPages.push(layout);
      page.cleanup();
    }
  } finally { await document.destroy(); }
  const parsed = parseSeatingPlanText(pages.join("\n\f\n"), { layout: layoutPages });
  const standalone = parseSeatingPlanText(`Room No. Drawing hall (Diploma building)\n${pages.at(-1)}`);
  const extractedText = pages.join("\n\n");
  const finalPageCrns = new Set((pages.at(-1).match(/\b\d{6,12}\b/g) || []));
  const parsedCrns = new Set(parsed.seats.map((entry) => entry.crn));
  const crnIndex = extractedText.indexOf(target);
  const headingMatches = [...extractedText.matchAll(/^\s*Room\s+No\.\s*(.+?)\s*$/gim)];
  const targetHeading = headingMatches.filter((match) => match.index < crnIndex).at(-1);
  const targetBlockEnd = targetHeading ? (headingMatches.find((match) => match.index > targetHeading.index)?.index ?? extractedText.length) : -1;
  const targetBody = targetHeading ? extractedText.slice(targetHeading.index + targetHeading[0].length, targetBlockEnd) : "";
  const targetTableStart = targetBody.search(/\bS\s*\.\s*No\b/i);
  const targetTableEnd = targetTableStart < 0 ? -1 : targetBody.slice(targetTableStart).search(/\bSECTION\s+ALLOTTED\b/i);
  const targetInsideParsedTable = targetTableStart >= 0 && targetTableEnd >= 0 && targetBody.slice(targetTableStart, targetTableStart + targetTableEnd).includes(target);
  const targetOffsetInBody = targetBody.indexOf(target);
  const targetContext = targetOffsetInBody >= 0 ? targetBody.slice(Math.max(0, targetOffsetInBody - 240), targetOffsetInBody + target.length + 120).replace(/\b(?!2630110\b)\d{6,12}\b/g, "[other CRN]") : "";
  const tableCandidates = [...targetBody.matchAll(/\bS\s*\.\s*No\b/gi)].map((match) => {
    const end = targetBody.slice(match.index).search(/\bSECTION\s+ALLOTTED\b/i);
    const segment = end < 0 ? "" : targetBody.slice(match.index, match.index + end);
    return { index: match.index, end, containsTarget: segment.includes(target), crnCount: [...segment.matchAll(/\b\d{6,12}\b/g)].length, preview: targetBody.slice(Math.max(0, match.index - 50), match.index + 100).replace(/\b\d{6,12}\b/g, "[number]") };
  });
  return {
    exists: true,
    bytes: fs.statSync(path).size,
    pages: document.numPages,
    ok: parsed.ok,
    rooms: parsed.rooms,
    assignments: parsed.seats.length,
    standaloneGrid: { ok: standalone.ok, rooms: standalone.rooms, assignments: standalone.seats.length, warnings: standalone.warnings, targetSeat: standalone.seats.find((entry) => entry.crn === target) || null },
    finalPageCRNs: finalPageCrns.size,
    finalPageOverlapWithParsed: [...finalPageCrns].filter((crn) => parsedCrns.has(crn)).length,
    finalPageUniqueToThisPlan: [...finalPageCrns].filter((crn) => !parsedCrns.has(crn)).length,
    pageSummary: pages.map((page, index) => ({ page: index + 1, rooms: [...page.matchAll(/Room\s+No\.\s*(.+)/gi)].map((match) => match[1].trim()), hasCrn: page.includes(target), totalLabels: [...page.matchAll(/TOTAL\s+STU\s*\.\s*\d+/gi)].map((match) => match[0]), edgHeaders: [...page.matchAll(/MSE-II\s+EDG[^\n]*/gi)].map((match) => match[0]) })),
    lastPagePreview: pages.at(-1).slice(0, 800).replace(/\b\d{6,12}\b/g, "[CRN]"),
    warnings: parsed.warnings,
    seat: parsed.seats.find((entry) => entry.crn === target) || null,
    sourceTextHasCrn: crnIndex >= 0,
    sourceTextContext: crnIndex >= 0 ? extractedText.slice(Math.max(0, crnIndex - 100), crnIndex + target.length + 100) : "",
    nearestRoomHeading: targetHeading?.[1]?.trim() || "",
    insideParsedTable: targetInsideParsedTable,
    tableStartOffset: targetTableStart,
    tableEndOffset: targetTableEnd,
    targetOffsetInRoom: targetOffsetInBody,
    safeTargetContext: targetContext,
    tableCandidates,
    printedTotalInBlock: /TOTAL\s+STU\s*\.\s*(\d+)/i.exec(targetBody)?.[1] || ""
  };
}

for (const [label, path, planId] of inputs) {
  const source = await parsePdf(path);
  console.log(JSON.stringify({ label, planId, source }));
}

const wrangler = spawnSync(process.execPath, [
  "node_modules/wrangler/bin/wrangler.js", "kv", "key", "get", "seating:v1:plans",
  "--binding", "CONTENT", "--remote", "--config", "wrangler.next.jsonc", "--text"
], { encoding: "utf8", maxBuffer: 12 * 1024 * 1024, timeout: 60000 });
if (wrangler.status !== 0) {
  console.log(JSON.stringify({ liveError: (wrangler.stderr || wrangler.stdout || "wrangler command failed").slice(0, 1000) }));
} else {
  const raw = wrangler.stdout.trim();
  let plans;
  try { plans = JSON.parse(raw); }
  catch {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start >= 0 && end > start) plans = JSON.parse(raw.slice(start, end + 1));
  }
  if (!Array.isArray(plans)) console.log(JSON.stringify({ liveParseError: "KV result was not a JSON array", outputStart: raw.slice(0, 600) }));
  else {
    for (const planId of inputs.map((item) => item[2])) {
      const plan = plans.find((entry) => entry?.id === planId);
      console.log(JSON.stringify({ live: true, planId, present: Boolean(plan), published: plan?.published !== false, assignments: plan?.seats?.length || 0, seat: plan?.seats?.find((entry) => entry?.crn === target) || null }));
    }
    console.log(JSON.stringify({ livePlansContainingCrn: plans.filter((plan) => plan?.published !== false && plan?.seats?.some((entry) => entry?.crn === target)).map(({ id, subject, date, start, end }) => ({ id, subject, date, start, end })) }));
  }
}
