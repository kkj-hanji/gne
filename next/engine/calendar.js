/**
 * Academic calendar, official holidays and working-day overrides.
 *
 * Provenance
 *  - Holidays: GNDEC "List of Holidays Year 2026" PDF
 *    https://gndec.ac.in/sites/default/files/LoH26.pdf (checked 2026-11-09)
 *  - Academic periods: GNDEC Academic Calendar Jul–Dec 2026, reference AS/81/2745
 *    https://gndec.ac.in/sites/default/files/acjul-dec26.pdf
 *
 * Admin-published overrides (for example a holiday declared in lieu of a working
 * Saturday) are merged on top and always labelled as an override. Nothing is
 * inferred: a date only becomes an off day when a source says so.
 */

export const HOLIDAY_SOURCE = Object.freeze({
  title: "List of Holidays Year 2026",
  url: "https://gndec.ac.in/sites/default/files/LoH26.pdf",
  checked: "2026-11-09"
});

export const CALENDAR_SOURCE = Object.freeze({
  title: "Academic Calendar · July–December 2026",
  url: "https://gndec.ac.in/sites/default/files/acjul-dec26.pdf",
  reference: "AS/81/2745",
  checked: "2026-09-15"
});

/** National and restricted holidays exactly as the official PDF prints them. */
export const HOLIDAYS_2026 = Object.freeze([
  ["2026-01-26", "Republic Day", "holiday"],
  ["2026-02-01", "Birthday of Sri Guru Ravidass Ji", "holiday"],
  ["2026-02-15", "Maha Shivratri", "holiday"],
  ["2026-03-04", "Holi", "holiday"],
  ["2026-03-21", "Id-ul-Fitr", "holiday"],
  ["2026-03-23", "Martyrdom Day of Shaheed-e-Azam Bhagat Singh, Sukhdev and Rajguru Ji", "holiday"],
  ["2026-03-26", "Ram Navmi", "holiday"],
  ["2026-03-31", "Mahavir Jayanti", "holiday"],
  ["2026-04-03", "Good Friday", "holiday"],
  ["2026-04-14", "Baisakhi", "holiday"],
  ["2026-04-14", "Birthday of Dr. B.R. Ambedkar", "holiday"],
  ["2026-04-19", "Bhagwan Parshu Ram Janam Utsav", "holiday"],
  ["2026-05-01", "May Diwas", "holiday"],
  ["2026-05-27", "Id-ul-Juha (Bakreed)", "holiday"],
  ["2026-06-18", "Martyrdom Day of Sri Guru Arjan Dev Ji", "holiday"],
  ["2026-06-29", "Kabir Jayanti", "holiday"],
  ["2026-07-31", "Martyrdom Day of Shaheed Udham Singh Ji", "holiday"],
  ["2026-08-15", "Independence Day", "holiday"],
  ["2026-09-04", "Janam Ashtami", "holiday"],
  ["2026-10-02", "Birthday of Mahatma Gandhi Ji", "holiday"],
  ["2026-10-11", "Maharaj Aggarsain Jayanti", "holiday"],
  ["2026-10-20", "Dussehra", "holiday"],
  ["2026-10-26", "Birthday of Maharishi Balmiki Ji", "holiday"],
  ["2026-11-08", "Diwali", "holiday"],
  ["2026-11-09", "Vishwakarma Day", "holiday"],
  ["2026-11-16", "Martyrdom Day of S. Kartar Singh Sarabha Ji", "holiday"],
  ["2026-11-24", "Birthday of Sri Guru Nanak Dev Sahib Ji", "holiday"],
  ["2026-12-14", "Martyrdom Day of Sri Guru Teg Bahadur Ji", "holiday"],
  ["2026-12-25", "Christmas Day", "holiday"],
  ["2026-12-28", "Shaheedi Sabha Fatehgarh Sahib", "holiday"],
  ["2026-10-27", "Parkash Gurparab Sri Guru Ram Dass Sahib Ji", "restricted"],
  ["2026-11-11", "Gurgaddi Diwas Sri Guru Granth Sahib Ji", "restricted"],
  ["2026-03-30", "Half day before Mahavir Jayanti", "half-day"],
  ["2026-06-17", "Half day before Shaheedi Diwas Sri Guru Arjan Dev Ji", "half-day"],
  ["2026-09-03", "Half day before Janam Ashtami", "half-day"],
  ["2026-11-23", "Half day before Gurparab Sahib Sri Guru Nanak Dev Ji", "half-day"]
].map(([date, name, type]) => Object.freeze({ date, name, type, source: "official-holiday-list" })));

/** Published academic periods. These are not individual exam sittings. */
export const ACADEMIC_PERIODS = Object.freeze([
  Object.freeze({
    scope: "First year, 2026 admission batch: B.Tech., M.Tech., MCA, MBA, BCA, BBA",
    kind: "first",
    start: "2026-08-10",
    prepStart: "2026-11-26",
    prepEnd: "2026-12-01",
    examsStart: "2026-12-02"
  }),
  Object.freeze({
    scope: "2026 admission batch: B.Tech.-LEET, BCA-LEET, B.Voc., B.Com. (Entrepreneurship)",
    kind: "leet",
    start: "2026-08-03",
    prepStart: "2026-11-26",
    prepEnd: "2026-12-01",
    examsStart: "2026-12-02"
  }),
  Object.freeze({
    scope: "Second year onwards: all programmes",
    kind: "continuing",
    start: "2026-07-27",
    prepStart: "2026-11-21",
    prepEnd: "2026-11-26",
    examsStart: "2026-11-27"
  })
]);

const DAY_NAMES = Object.freeze(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);

export function dateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function dayOfWeek(value) {
  const iso = dateOnly(value);
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return DAY_NAMES[date.getUTCDay()];
}

/**
 * Merge official holidays with admin overrides.
 * An override with `off: false` turns a published holiday into a working day
 * (for example a working Saturday) and is always returned with `overridden`.
 */
export function holidayIndex(overrides = []) {
  const map = new Map();
  for (const item of HOLIDAYS_2026) {
    map.set(item.date, { ...item, overridden: false });
  }
  for (const item of Array.isArray(overrides) ? overrides : []) {
    const iso = dateOnly(item?.date);
    if (!iso) continue;
    const name = String(item?.name || "").trim().slice(0, 160);
    if (!name) continue;
    map.set(iso, {
      date: iso,
      name,
      type: item?.off === false ? "working" : String(item?.type || "holiday"),
      source: String(item?.source || "admin"),
      overridden: true
    });
  }
  return map;
}

export function holidayOn(date, overrides = []) {
  const iso = dateOnly(date);
  if (!iso) return null;
  return holidayIndex(overrides).get(iso) || null;
}

/** True only when a published source marks the date as an off day. */
export function isOffDay(date, overrides = []) {
  const item = holidayOn(date, overrides);
  return Boolean(item) && item.type !== "working" && item.type !== "half-day";
}

export function upcomingHolidays(fromISO, { overrides = [], limit = 6 } = {}) {
  const from = dateOnly(fromISO);
  if (!from) return [];
  return [...holidayIndex(overrides).values()]
    .filter((item) => item.date >= from && item.type !== "working")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, Math.max(1, Number(limit) || 6));
}

export function academicPeriodFor(question = "") {
  const q = String(question || "").toLowerCase();
  if (!/\b(?:academic calendar|semester|session|exams?|preparatory|vacation|holidays?)\b/.test(q)) return [];
  if (/\b(?:jan(?:uary)?|jun(?:e)?|even semester|spring)\b/.test(q)) return [];
  const kind = /\bleet|b\.?voc|b\.?com\b/.test(q)
    ? "leet"
    : /\b(?:second|third|fourth|2nd|3rd|4th|continuing)\s*(?:year)?\b/.test(q)
      ? "continuing"
      : /\b(?:first|1st)\s*year|2026\s*(?:batch|admission)|\b(?:sem|semester)\s*1\b/.test(q)
        ? "first"
        : "";
  return ACADEMIC_PERIODS.filter((period) => !kind || period.kind === kind);
}

export function holidaySummary(date, overrides = []) {
  const item = holidayOn(date, overrides);
  if (!item) return "";
  const day = dayOfWeek(date);
  const suffix = day ? ` (${day})` : "";
  if (item.type === "working") return `${dateOnly(date)}${suffix} is a working day: ${item.name}.`;
  if (item.type === "restricted") return `${dateOnly(date)}${suffix} is a restricted holiday: ${item.name}.`;
  if (item.type === "half-day") return `${dateOnly(date)}${suffix} is a half-day: ${item.name}.`;
  return `${dateOnly(date)}${suffix} is a closed holiday: ${item.name}.`;
}
