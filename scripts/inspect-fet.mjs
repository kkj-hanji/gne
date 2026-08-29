// Inspect official FET groups timetable for specific groups, per day
import fs from "node:fs";

const h = fs.readFileSync(new URL("../fet_groups.html", import.meta.url), "utf8");

// Balanced extraction: handles <table class="detailed"> nested inside cells
function extractTables(html) {
  const out = [];
  const re = /<table[\s>]/g;
  let m;
  while ((m = re.exec(html))) {
    let depth = 1, i = m.index + 7;
    while (depth > 0 && i < html.length) {
      const open = html.indexOf("<table", i), close = html.indexOf("</table>", i);
      if (close === -1) { i = html.length; break; }
      if (open !== -1 && open < close) { depth++; i = open + 6; }
      else { depth--; i = close + 8; }
    }
    out.push(html.slice(m.index, i));
    re.lastIndex = m.index + 7;
  }
  return out;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function captionOf(t) {
  const m = t.match(/<caption>[\s\S]*?<\/caption>/);
  if (!m) return "";
  return m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replace(/^.*?LUDHIANA\s*/, "");
}
function textOf(el) {
  return el.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseTable(t) {
  const name = captionOf(t);
  const body = t.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] || "";
  const rows = body.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const days = {};
  const grid = [];
  let row = 0;
  for (const rawRow of rows) {
    const timeM = rawRow.match(/<th class="yAxis">([\s\S]*?)<\/th>/);
    const time = timeM ? textOf(timeM[1]) : null;
    const cells = [...rawRow.matchAll(/<td[\s>][\s\S]*?<\/td>/g)].map((m) => m[0]);
    let di = 0;
    for (const cell of cells) {
      while (grid[row] && grid[row][di]) di++;
      const isEmpty = /class="empty"/.test(cell) || /^---$/.test(textOf(cell));
      const colspan = +(/colspan="(\d+)"/.exec(cell)?.[1] || 1);
      const rowspan = +(/rowspan="(\d+)"/.exec(cell)?.[1] || 1);
      for (let c = 0; c < colspan; c++) {
        if (!isEmpty && time) {
          days[DAYS[di + c]] = days[DAYS[di + c]] || [];
          days[DAYS[di + c]].push({ time, text: textOf(cell) });
        }
        for (let r = 0; r < rowspan; r++) {
          grid[row + r] = grid[row + r] || [];
          grid[row + r][di + c] = isEmpty ? null : true;
        }
      }
      di += colspan;
    }
    row++;
  }
  return { name, days };
}

const tables = extractTables(h);
const groups = process.argv.slice(2);
for (const g of groups) {
  const t = tables.find((t) => captionOf(t) === g);
  if (!t) { console.log(`== ${g}: NOT FOUND`); continue; }
  const s = parseTable(t);
  console.log(`\n===== ${g} =====`);
  for (const d of DAYS) {
    console.log(`\n--- ${d} ---`);
    const entries = s.days[d] || [];
    if (!entries.length) console.log("(empty)");
    for (const e of entries) console.log(`  ${e.time}  ${e.text}`);
  }
}
