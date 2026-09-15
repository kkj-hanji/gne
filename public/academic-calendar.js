// Transcribed from GNDEC Academic Section PDFs, checked 15 September 2026.
// These are academic periods, not individual subject examination sittings.
(function (root) {
  "use strict";
  const source = Object.freeze({
    title: "Academic Calendar · July–December 2026", issued: "2026-07-28", checked: "2026-09-15",
    reference: "AS/81/2745", url: "https://gndec.ac.in/sites/default/files/acjul-dec26.pdf",
    hash: "2dfede45d5ce19e6018d022f49f39cd088985ce6e7cb9521b6713bf685a3c3f1"
  });
  const periods = Object.freeze([
    Object.freeze({ scope: "First year, 2026 admission batch: B.Tech., M.Tech., MCA, MBA, BCA, BBA", kind: "first", start: "2026-08-10", prepStart: "2026-11-26", prepEnd: "2026-12-01", examsStart: "2026-12-02" }),
    Object.freeze({ scope: "2026 admission batch: B.Tech.-LEET, BCA-LEET, B.Voc., B.Com. (Entrepreneurship)", kind: "leet", start: "2026-08-03", prepStart: "2026-11-26", prepEnd: "2026-12-01", examsStart: "2026-12-02" }),
    Object.freeze({ scope: "Second year onwards: all programmes", kind: "continuing", start: "2026-07-27", prepStart: "2026-11-21", prepEnd: "2026-11-26", examsStart: "2026-11-27" })
  ]);
  function matches(question) {
    const q = String(question || "").toLowerCase();
    if (/\b(?:syllabus|credits?|marks?|duration|calculator|pattern)\b/.test(q)) return false;
    return /\bacademic calendar\b|\bsemester\b.*\b(?:start|begin|end|finish|timeline)\b|\b(?:start|begin|end|finish)\b.*\bsemester\b|\b(?:end[- ]semester|ese|final exams?|finals|preparatory|(?:winter|summer)\s+(?:vacation|holiday))\b/.test(q);
  }
  function resolve(question, currentSource) {
    if (!matches(question)) return null;
    const q = String(question).toLowerCase();
    const result = { source, periods: [] };
    const currentUrl = currentSource?.url?.replace("https://www.gndec.ac.in/", "https://gndec.ac.in/");
    if (currentSource && (currentUrl !== source.url || currentSource.verified === false || (currentSource.contentHash && currentSource.contentHash !== source.hash))) {
      return { ...result, message: "A different academic calendar is selected. Open the current official calendar to verify its dates; these stored dates will not override a revision." };
    }
    if ((q.match(/\b20\d{2}\b/g) || []).some((year) => year !== "2026") || /\b(?:jan(?:uary)?|jun(?:e)?|even semester|spring)\b/.test(q)) return { ...result, message: "The structured dates here cover July–December 2026. Use the official calendar archive for another session." };
    if (/\b(?:winter|summer)\s+(?:vacation|holiday)/.test(q)) return { ...result, message: "The July–December 2026 calendar says winter vacations will be notified by the Principal Office. It does not publish vacation dates here." };
    const kind = /\bleet|b\.?voc|b\.?com\b/.test(q) ? "leet" : /\b(?:second|third|fourth|2nd|3rd|4th|continuing)\s*(?:year)?\b/.test(q) ? "continuing" : /\b(?:first|1st)\s*year|2026\s*(?:batch|admission)|\b(?:sem|semester)\s*1\b/.test(q) ? "first" : "";
    return { ...result, periods: periods.filter((period) => !kind || period.kind === kind),
      message: "These are published academic periods. The calendar does not give subject-wise exam dates or a final semester-end date; MSE-I/MSE-II and winter vacations require separate notices." };
  }
  root.CompassAcademicCalendar = Object.freeze({ source, periods, matches, resolve });
})(globalThis);
