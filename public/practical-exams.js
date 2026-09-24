/* Transcribed from user-supplied notices, 24 September 2026.
 * Three handwritten AM/PM errors were corrected by the supplying user on 24 September 2026. */
(function (root) {
  "use strict";
  const source = Object.freeze({
    title: "MSE-I practical examinations · October 2026",
    issued: "2026-09-18", url: "/notices/mse1-practicals-2026.html",
    provenance: "User-supplied notice photographs and message; workshop times confirmed by the supplying user on 24 September 2026. Official web publication not verified."
  });
  const workshops = [
    { section: "MEB", date: "2026-10-07", periods: "3–4", printedTime: "10:30 AM to 12:30 PM", start: 630, end: 750 },
    { section: "MEA", date: "2026-10-08", periods: "1–2", printedTime: "8:30 AM to 10:30 AM", start: 510, end: 630 },
    { section: "RAI", date: "2026-10-08", periods: "1–2", printedTime: "8:30 AM to 10:30 AM", start: 510, end: 630 },
    { section: "CEB", date: "2026-10-08", periods: "7–8", printedTime: "2:30 PM to 4:30 AM", correctedTime: "2:30 PM to 4:30 PM", start: 870, end: 990 },
    { section: "ECA", date: "2026-10-08", periods: "7–8", printedTime: "2:30 PM to 4:30 PM", start: 870, end: 990 },
    { section: "CEA", date: "2026-10-09", periods: "3–4", printedTime: "10:30 AM to 12:30 PM", start: 630, end: 750 },
    { section: "EEA", date: "2026-10-09", periods: "5–6", printedTime: "12:30 PM to 2:30 PM", start: 750, end: 870 },
    { section: "ECB", date: "2026-10-09", periods: "5–6", printedTime: "12:30 PM to 2:30 AM", correctedTime: "12:30 PM to 2:30 PM", start: 750, end: 870 },
    { section: "EEB", date: "2026-10-09", periods: "7–8", printedTime: "2:30 PM to 4:30 AM", correctedTime: "2:30 PM to 4:30 PM", start: 870, end: 990 }
  ].map(row => Object.freeze({ ...row, subgroups: Object.freeze([`${row.section}1`, `${row.section}2`]) }));
  Object.freeze(workshops);
  const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  function matches(question) {
    const q = normalize(question);
    return /\b(?:labs?|laborator(?:y|ies)|practicals?|workshops?|manufacturing|mp|viva)\b/.test(q)
      && /\b(?:mse\s*-?\s*(?:i|1)?|exams?|examinations?|test|viva|notice|date\s*sheet)\b/.test(q);
  }
  function resolve(question, context = {}) {
    const q = normalize(question);
    if (!matches(q)) return null;
    const result = extra => ({ source, workshops: [], ...extra });
    if (/\b(?:mse\s*-?\s*(?:[23]|ii|iii)|ese|end\s*sem|second\s*semester|sem(?:ester)?\s*[2-8])\b/.test(q) || (q.match(/\b20\d{2}\b/g) || []).some(y => y !== "2026")) return result({ message: "These supplied notices cover MSE-I, Semester I, October 2026 only." });
    const genericPractical = /\bpracticals?\b/.test(q) && !/\b(?:physics|phy|chemistry|chem|english|pps|programming|beee|edg)\b/.test(q);
    const workshop = genericPractical || /\b(?:workshops?|manufacturing|mp|all|both|physics\s+group)\b/.test(q);
    const labs = !/\b(?:workshops?|manufacturing|mp)\b/.test(q) || /\b(?:labs?|physics|chem(?:istry)?|english|all|both)\b/.test(q);
    const labMessage = "MSE-I practical examinations: 5–9 October 2026. The supplied message specifies Physics, Chemistry and English labs in your respective lab turns. Keep your files ready and prepare thoroughly for viva. If a scheduled examination day is a holiday, the signed notice says it moves to the corresponding day of the following week. Exact individual lab dates and times are not listed in these notices; confirm your lab turn with the lab in-charge.";
    if (/\b(?:pps|programming|beee|edg|biology)\b/.test(q) && !workshop) return result({ message: "The accompanying lab message names Physics, Chemistry and English. It does not give a subject-specific examination date or time for the course you requested. Confirm with your lab in-charge." });
    if (["invalid", "conflict"].includes(context.temporal?.status)) return result({ message: context.temporal.reason });
    let selected = workshops;
    if (workshop) {
      const codes = [...q.matchAll(/\b(cs|cse|ec|ece|ee|ce|me|it)[ -]*([a-z])(?:[ -]*(\d))?\b|\b(rai)(?:[ -]*(\d))?\b/g)];
      const sections = [];
      for (const code of codes) {
        const section = code[4] ? "RAI" : `${({ ece: "ec", cse: "cs" })[code[1]] || code[1]}${code[2]}`.toUpperCase();
        const subgroup = code[3] || code[5];
        if (!workshops.some(row => row.section === section) || (subgroup && !["1", "2"].includes(subgroup))) return result({ message: `${section}${subgroup || ""} is not listed in the supplied Physics Group workshop schedule.` });
        sections.push(section);
      }
      if (!sections.length) {
        const branch = q.match(/\b(ec|ece|ee|ce|me|rai|cs|cse|it)\b/);
        if (branch) {
          const prefix = ({ ece: "EC", cse: "CS" })[branch[1]] || branch[1].toUpperCase();
          sections.push(...workshops.filter(row => row.section === prefix || row.section.slice(0, -1) === prefix).map(row => row.section));
          if (!sections.length) return result({ message: "That branch is not listed in the supplied Physics Group workshop schedule." });
        } else if (!/\b(?:all|full|every|physics\s+group)\b/.test(q) && context.section) sections.push(context.section);
        else if (/\b(?:my|mine|mera|meri)\b/.test(q)) return result({ message: "Choose your timetable section on this device to see your workshop examination." });
      }
      if (sections.length) selected = selected.filter(row => sections.includes(row.section));
      const dates = context.temporal?.dates || [];
      if (dates.length) {
        const range = dates.length === 2 && /\b(?:from|between|to|through)\b/.test(q);
        const sorted = [...dates].sort();
        selected = selected.filter(row => range ? row.date >= sorted[0] && row.date <= sorted[1] : dates.includes(row.date));
      }
      if (/\b(?:next|upcoming)\b/.test(q) && context.today) selected = selected.filter(row => row.date > context.today || (row.date === context.today && row.start > context.minutes));
      if (/\b(?:now|current|ongoing)\b/.test(q) && context.today) selected = selected.filter(row => row.date === context.today && row.start <= context.minutes && row.end > context.minutes);
    }
    return result({ workshops: workshop ? selected : [], message: [labs ? labMessage : "", workshop && !selected.length ? "No matching workshop sitting is listed in the supplied schedule; this does not establish that no examination exists." : ""].filter(Boolean).join(" ") });
  }
  root.CompassPracticals = Object.freeze({ source, workshops, matches, resolve });
})(globalThis);
