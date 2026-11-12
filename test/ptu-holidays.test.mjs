import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dayOfWeek } from "../next/engine/calendar.js";
import { PTU_HOLIDAYS_2027 } from "../next/data/ptu-holidays-2027.js";
import { fetchPtuHolidaySources, parsePtuHolidayIndex, ptuHolidaySeed } from "../src/ptu-holidays.js";
import { handleRequest } from "../src/next-core.js";

const html = `<table><tr><td><p>Gazetted and reserved holidays of the calendar year 2027.</p></td><td><a href="https://ptu.ac.in/wp-content/uploads/2026/10/holidays-2027.pdf">PDF</a></td></tr><tr><td><p>Gazetted and reserved holidays of the calendar year 2026.</p></td><td><a href="/wp-content/uploads/2025/12/holidays-2026.pdf">PDF</a></td></tr></table>`;

test("PTU holiday page parser discovers the English year links and rejects untrusted hosts", () => {
  const years = parsePtuHolidayIndex(html);
  assert.equal(years["2027"].url, "https://ptu.ac.in/wp-content/uploads/2026/10/holidays-2027.pdf");
  assert.equal(years["2026"].url, "https://ptu.ac.in/wp-content/uploads/2025/12/holidays-2026.pdf");
  assert.deepEqual(parsePtuHolidayIndex(`<tr><td>calendar year 2027</td><td><a href="https://example.com/holidays.pdf">bad</a></td></tr>`), {});
});

test("published 2027 gazetted dates are valid and weekday labels agree with dates", () => {
  assert.equal(PTU_HOLIDAYS_2027.length, 32);
  for (const { date, name } of PTU_HOLIDAYS_2027) {
    assert.match(date, /^2027-\d{2}-\d{2}$/);
    assert.ok(name.length > 2);
    assert.ok(dayOfWeek(date));
  }
  assert.equal(dayOfWeek("2027-01-15"), "Friday");
  assert.equal(dayOfWeek("2027-12-28"), "Tuesday");
});

test("PTU refresh follows the official page and flags changed PDFs instead of trusting stale rows", async () => {
  const bytes = new TextEncoder().encode("changed pdf content");
  const fetchImpl = async (url) => {
    if (url === "https://ptu.ac.in/holidays/") return new Response(html, { headers: { "Content-Type": "text/html" } });
    return new Response(bytes, { headers: { "Content-Type": "application/pdf" } });
  };
  const result = await fetchPtuHolidaySources({ fetchImpl, previous: ptuHolidaySeed });
  assert.equal(result.years["2027"].changed, true);
  assert.equal(result.years["2026"].changed, true);
  assert.ok(result.checkedAt);
});

test("PTU public API returns source links with secure headers", async () => {
  const request = new Request("https://compass.test/api/ptu-holidays");
  const response = await handleRequest(request, {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  const payload = await response.json();
  assert.equal(payload.source, "https://ptu.ac.in/holidays/");
  assert.ok(payload.years["2026"].url.endsWith(".pdf"));
  assert.ok(payload.years["2027"].url.endsWith(".pdf"));
});

test("calendar view explains PTU scope and separates it from GNDEC working-day changes", async () => {
  const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
  assert.match(app, /function renderPtuHolidayReferences/);
  assert.match(app, /GNDEC notices and its academic calendar decide GNDEC working days/);
  assert.match(app, /2027 gazetted holidays/);
  assert.match(app, /PTU’s 2027 PDF has changed/);
});
