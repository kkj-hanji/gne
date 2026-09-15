// Bounded timetable operations. The caller supplies verified, scoped rows;
// this module never fetches sources or resolves a person from a name.
(function (root) {
  "use strict";
  const MAX_DATES = 31;
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const dayOf = (iso) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const shift = (iso, days) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

  function request(question, temporal = { status: "none", dates: [] }) {
    const q = String(question || "").toLowerCase();
    if (/\b(?:syllabus|credits?|exams?|mse|date\s*sheet|holiday|students?|roster|crn|registration|marks?|calendar)\b/.test(q)) return null;
    const schedule = /\b(?:timetable|schedule|classes|class|lectures?|periods?)\b/.test(q);
    const comparison = /\b(?:compare|comparison|different|difference|vs|versus|farak|farq)\b/.test(q);
    const rank = /\b(?:most|least|busiest|lightest|heaviest|fewest)\b/.test(q);
    const groupBy = rank && /\b(?:teacher|teachers|teaches|faculty)\b/.test(q) ? "teacher" : rank && /\b(?:room|rooms)\b/.test(q) ? "room" : rank && /\b(?:day|days|week)\b/.test(q) ? "day" : "";
    const count = /\b(?:how many|count|total|number of)\s+(?:(?:my|our|the|scheduled|timetable)\s+)*(?:classes|class|lectures?|periods?)\b|\b(?:classes|class|lectures?|periods?)\s+(?:count|total)\b/.test(q) && !/\bfree\b/.test(q);
    const compareDates = comparison && schedule && temporal.dates?.length === 2;
    const dateSpan = ["range", "multiple"].includes(temporal.status) || /\b(?:this|next|last|previous|whole|entire) week\b/.test(q);
    if (comparison && !compareDates) return null;
    if (!groupBy && !count && !compareDates && !(schedule && dateSpan)) return null;
    return { operation: compareDates ? "compareDates" : groupBy ? "rank" : count ? "count" : "schedule",
      groupBy, metric: /\b(?:lightest|busiest|heaviest|hours?|duration|time)\b/.test(q) ? "minutes" : "count",
      order: /\b(?:least|lightest|fewest)\b/.test(q) ? "ascending" : "descending", temporal };
  }

  function dateScope(plan, today) {
    const temporal = plan.temporal;
    if (["invalid", "conflict", "limited"].includes(temporal.status)) return { error: temporal.reason };
    if (temporal.dates?.length) {
      if (temporal.dates.length > MAX_DATES) return { error: `Please request at most ${MAX_DATES} dates at once.` };
      return { dates: temporal.dates };
    }
    const monday = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    return { dates: Array.from({ length: 7 }, (_, index) => shift(monday, index)) };
  }

  function occupiedMinutes(rows) {
    const intervals = rows.map(({ start, end }) => [start, end]).sort((a, b) => a[0] - b[0]);
    let total = 0, end = -1;
    for (const [start, stop] of intervals) { total += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop); }
    return total;
  }
  const identity = (row) => [row.start, row.end, row.subject, row.teacher, row.room, row.type].join("\u001f");

  function execute(plan, { rows, dates, teachers = (value) => [value] }) {
    if (!Array.isArray(rows) || rows.length > 10000 || !Array.isArray(dates) || dates.length > MAX_DATES) return { error: "The timetable request is too large to verify safely." };
    if (!dates.length || dates.some((date) => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) return { error: "The requested calendar dates could not be validated." };
    if (plan.operation === "compareDates" && dates.length !== 2) return { error: "Choose two dates to compare." };
    if (rows.some((row) => !Number.isFinite(row.start) || !Number.isFinite(row.end) || row.start < 0 || row.end <= row.start || row.end > 1440 || !row.subject || !row.day)) return { error: "Some timetable entries could not be validated. Refresh the official timetable before calculating." };
    const occurrences = dates.flatMap((date) => {
      const unique = new Map(rows.filter((row) => row.day === dayOf(date)).map((row) => [identity(row), row]));
      return [...unique.values()].map((row) => ({ ...row, date }));
    });
    if (plan.operation === "schedule") return { occurrences };
    if (plan.operation === "compareDates") {
      const [leftDate, rightDate] = dates;
      const left = occurrences.filter((row) => row.date === leftDate), right = occurrences.filter((row) => row.date === rightDate);
      const common = left.filter((row) => right.some((other) => identity(row) === identity(other)));
      return { occurrences, leftDate, rightDate, common,
        leftOnly: left.filter((row) => !common.includes(row)), rightOnly: right.filter((row) => !common.some((other) => identity(row) === identity(other))),
        leftMinutes: occupiedMinutes(left), rightMinutes: occupiedMinutes(right) };
    }
    const minutes = dates.reduce((total, date) => total + occupiedMinutes(occurrences.filter((row) => row.date === date)), 0);
    if (plan.operation === "count") return { occurrences, count: occurrences.length, minutes };
    const buckets = new Map();
    if (plan.groupBy === "day") for (const date of dates) if (weekdays.includes(dayOf(date))) buckets.set(date, []);
    let missing = 0;
    for (const row of occurrences) {
      const keys = plan.groupBy === "day" ? [row.date] : plan.groupBy === "teacher" ? teachers(row.teacher) : [row.room];
      const known = keys.filter((key) => key && !/not listed|unknown/i.test(key));
      if (!known.length) missing++;
      for (const key of new Set(known)) buckets.set(key, [...(buckets.get(key) || []), row]);
    }
    const ranking = [...buckets].map(([key, items]) => ({ key, count: items.length,
      minutes: dates.reduce((total, date) => total + occupiedMinutes(items.filter((row) => row.date === date)), 0) }));
    ranking.sort((a, b) => (plan.order === "ascending" ? 1 : -1) * (a[plan.metric] - b[plan.metric]) || a.key.localeCompare(b.key));
    return { occurrences, ranking, missing, winners: ranking.filter((item) => item[plan.metric] === ranking[0]?.[plan.metric]) };
  }
  root.CompassScheduleAnalysis = Object.freeze({ request, dateScope, execute, dayOf, occupiedMinutes });
})(globalThis);
