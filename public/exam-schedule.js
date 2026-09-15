/* Supplied date sheets are independent of weekly FET timetables. Replace a
 * revision only after transcribing and testing the replacement document. */
(function (root) {
  "use strict";
  const chemistry = ["CSA", "CSB", "CSC", "CSD", "CSE", "CSF", "ITA", "ITB", "ITC"];
  const physics = ["MEA", "MEB", "CEA", "CEB", "EEA", "EEB", "ECA", "ECB", "RAI"];
  const source = {
    id: "mse1-sem1-2026-09-14", title: "MSE-I · Semester I · September–October 2026",
    issuer: "GNDEC Department of Applied Sciences", issued: "2026-09-14",
    provenance: "User-supplied PDF", officialUrl: null,
    pdfUrl: "/data/mse1-sem1-2026-09-14.pdf",
    sha256: "deb3b035dad6899efb112c9c2ee897337a36fab086c0f6659735dafe5335737c",
    semester: 1, revision: 1, timezone: "Asia/Kolkata"
  };
  const subjects = {
    chemistry: { label: "Chemistry", aliases: ["chemistry", "chem"] },
    maths: { label: "Mathematics-I", aliases: ["mathematics", "maths", "math", "mathematics i"] },
    pps: { label: "PPS", aliases: ["pps", "programming for problem solving", "programming"] },
    beee: { label: "BEEE", aliases: ["beee", "basic electrical and electronics engineering"] },
    english: { label: "English", aliases: ["english", "professional english communication", "pec"] },
    physics: { label: "Physics", aliases: ["physics", "phy"] },
    edg: { label: "EDG", aliases: ["edg", "engineering drawing", "engineering drawing and graphics"] },
    economics: { label: "Economics", aliases: ["economics", "eco"] }
  };
  const row = (date, start, end, subject, sections) => ({ date, start, end, subject, sections });
  const entries = [
    row("2026-09-25", 555, 645, "chemistry", chemistry),
    row("2026-09-28", 555, 645, "maths", chemistry),
    row("2026-09-29", 555, 645, "pps", chemistry),
    row("2026-09-30", 555, 645, "beee", chemistry),
    row("2026-10-01", 555, 645, "english", chemistry),
    row("2026-09-25", 765, 855, "physics", physics),
    row("2026-09-28", 555, 645, "maths", physics),
    row("2026-09-29", 555, 645, "pps", physics),
    row("2026-09-30", 555, 645, "edg", ["MEA", "MEB", "CEA", "CEB", "RAI"]),
    row("2026-09-30", 660, 750, "edg", ["EEA", "EEB", "ECA", "ECB"]),
    row("2026-10-01", 765, 855, "economics", physics)
  ];
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  function matches(question) {
    const q = normalize(question);
    if (/\b(?:syllabus|marks?|marking|pattern|calculator|credits?|results?|preparation|prepare|tips)\b/.test(q) && !/date\s*[- ]?sheet|\b(?:when|date|kab|kado|schedule)\b/.test(q)) return false;
    return /\b(?:date\s*[- ]?sheets?|mse\s*[- ]?(?:i{1,3}|[123])?|mid\s*[- ]?sem(?:ester)?|exams?|examinations?|papers?|pariksha)\b/.test(q);
  }
  const includesWord = (q, value) => (` ${q.replace(/[^a-z0-9]+/g, " ")} `).includes(` ${value} `);
  function resolve(question, context = {}) {
    const q = normalize(question);
    if (!matches(q)) return null;
    const result = (extra) => ({ source, entries: [], ...extra });
    if (/\b(?:mse\s*[- ]?(?:ii\b|iii\b|[23])|sem(?:ester)?\s*[- ]?(?:[2-8]|ii\b|iii\b|iv\b|v\b|vi\b|vii\b|viii\b)|(?:second|third|fourth|[2-8](?:nd|rd|th))\s+(?:semester|sem|year)|end\s*[- ]?sem(?:ester)?|ese|final exams?|reappear|supplementary|mba|mca|mtech|barch)\b/.test(q) || (q.match(/\b20\d{2}\b/g) || []).some((year) => year !== "2026")) {
      return result({ message: "The supplied date sheet covers MSE-I, Semester I, September–October 2026 only. I do not have a date sheet for the exam session you requested." });
    }
    const allSections = [...new Set(entries.flatMap((entry) => entry.sections))];
    const codes = [...q.matchAll(/\b(cs|cse|ec|ece|ee|ce|me|it|rai)[ -]*([a-z])(?:[ -]*(\d))?\b/g)];
    let sections = [];
    for (const match of codes) {
      const branch = ({ ece: "ec", cse: "cs" })[match[1]] || match[1];
      const section = `${branch}${match[2]}`.toUpperCase();
      const code = section + (match[3] || "");
      if (!allSections.includes(section) || (match[3] && context.subsections?.[code] !== section)) {
        return result({ message: `I cannot verify ${code} against this date sheet and the loaded section mapping. Choose one of the sections printed in the PDF.` });
      }
      sections.push(section);
    }
    if (!sections.length) {
      const branches = ["cs", "ec", "ee", "ce", "me", "it", "rai"].filter((branch) => {
        if (branch === "it") return /\bit\s+(?:branch|department)|\b(?:branch|department)\s+it\b|^it\s+(?:date|exam|mse|paper)/.test(q);
        return includesWord(q, branch) || includesWord(q, ({ cs: "cse", ec: "ece" })[branch] || branch);
      });
      if (branches.length) sections = allSections.filter((section) => branches.some((branch) => section === branch.toUpperCase() || section.slice(0, -1) === branch.toUpperCase()));
    }
    if (!sections.length && /\bchemistry group\b/.test(q)) sections = chemistry;
    if (!sections.length && /\bphysics group\b/.test(q)) sections = physics;
    if (!sections.length && !/\b(?:all|both|every)\b/.test(q)) {
      if (allSections.includes(context.section)) sections = [context.section];
      else if (/\b(?:my|mine|mera|meri|mere|apna|apni|our)\b/.test(q)) return result({ message: "Choose your section on this device so I can show the applicable exams." });
      else if (context.section) return result({ message: "The selected section is not listed in this first-semester date sheet. Choose a section printed in the PDF." });
    }
    if (!sections.length) sections = allSections;
    let selected = entries.filter((entry) => entry.sections.some((section) => sections.includes(section)));
    const subjectIds = Object.keys(subjects).filter((id) => subjects[id].aliases.some((alias) => includesWord(q, alias)) && !includesWord(q, `${id} group`));
    if (subjectIds.length) selected = selected.filter((entry) => subjectIds.includes(entry.subject));
    // An unknown course/person must never silently turn into the device's
    // complete exam list. Keep recognized date/scope words out of this check.
    let remainder = q;
    for (const subject of Object.values(subjects)) for (const alias of [...subject.aliases].sort((a, b) => b.length - a.length)) remainder = remainder.replaceAll(alias, " ");
    remainder = remainder.replace(/\b(?:cs|cse|ec|ece|ee|ce|me|it|rai)[ -]*[a-z]?(?:[ -]*\d)?\b/g, " ")
      .replace(/\b(?:date\s*[- ]?sheets?|mse|i|ii|mid|sem|semester|exams?|examinations?|papers?|pariksha|first|year|gn?dec|compass|campass|applied sciences|group|branch|department|sections?|subsections?|batch|time\s*table|schedule|routine|dates?|days?|times?|timings?|duration|minutes?|hours?|when|what|which|who|how|many|count|total|long|is|are|was|will|be|do|does|have|has|can|you|u|tell|show|give|please|me|my|mine|our|the|a|an|for|of|on|at|in|it|from|between|to|through|and|with|all|both|every|full|whole|complete|next|upcoming|current|ongoing|now|today|tomorrow|yesterday|after|before|this|last|previous|week|month|room|where|venue|seating|seat|invigilators?|teachers?|kithe|kahan|mera|meri|mere|apna|apni|ka|ki|ke|da|di|de|hai|hain|aa|batao|dikhao|dasso|kab|kado|kadon|kya|kehda|kehdi|kitne|kinne|baje|agla|agli|aglaa|nu|te|aur|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/g, " ")
      .replace(/\b\d+(?:st|nd|rd|th)?\b|[^a-z]/g, "");
    if (remainder) return result({ message: "I could not match every requested person, subject or detail to this date sheet. Specify a printed section and subject, or ask for the full MSE-I date sheet." });
    const temporal = context.temporal;
    if (["invalid", "conflict"].includes(temporal?.status)) return result({ message: temporal.reason });
    if (temporal?.dates?.length) {
      const dates = temporal.dates;
      const range = dates.length === 2 && /\b(?:from|between|to|through)\b/.test(q);
      selected = selected.filter((entry) => range ? entry.date >= [...dates].sort()[0] && entry.date <= [...dates].sort()[1] : dates.includes(entry.date));
    } else {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const namedMonths = [...q.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/g)].map((match) => months.indexOf(match[1].slice(0, 3)) + 1);
      const relativeMonth = q.match(/\b(this|next|last|previous) month\b/);
      if (namedMonths.length) selected = selected.filter((entry) => namedMonths.includes(Number(entry.date.slice(5, 7))));
      else if (relativeMonth && context.today) {
        const offset = relativeMonth[1] === "next" ? 1 : relativeMonth[1] === "this" ? 0 : -1;
        const monthDate = new Date(`${context.today.slice(0, 7)}-01T00:00:00Z`);
        monthDate.setUTCMonth(monthDate.getUTCMonth() + offset);
        selected = selected.filter((entry) => entry.date.startsWith(monthDate.toISOString().slice(0, 7)));
      }
    }
    const next = /\b(?:next|upcoming|agla|agli|aglaa)\b/.test(q) && !/\bnext\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q);
    const current = /\b(?:current|ongoing|now)\b/.test(q);
    if (next || current) {
      if (!context.today || !Number.isFinite(context.minutes)) return result({ message: "I could not determine the current India date and time. Ask for the full date sheet instead." });
      selected = selected.filter((entry) => current ? entry.date === context.today && entry.start <= context.minutes && entry.end > context.minutes : entry.date > context.today || (entry.date === context.today && entry.start > context.minutes));
    }
    selected.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    if (next && selected.length) selected = selected.filter((entry) => entry.date === selected[0].date && entry.start === selected[0].start);
    // Merge only identical sittings, retaining all applicable section labels.
    const merged = new Map();
    for (const entry of selected) {
      const key = `${entry.date}/${entry.start}/${entry.end}/${entry.subject}`;
      const item = merged.get(key) || { ...entry, sections: [] };
      item.sections.push(...entry.sections.filter((section) => sections.includes(section)));
      merged.set(key, item);
    }
    const missing = /\b(?:room|where|venue|seating|seat|invigilator|teacher|kithe|kahan)\b/.test(q);
    return result({ entries: [...merged.values()], sections: [...new Set(sections)],
      count: /\b(?:how many|count|total|kitne|kinne)\b/.test(q),
      message: missing ? "The date sheet does not list rooms, seating or invigilators. Those details cannot be confirmed from this document." : selected.length ? "" : "No matching exam is listed in this supplied date sheet. This does not establish that college is closed or that no other examination exists." });
  }
  function freeze(value) { Object.values(value).forEach((item) => { if (item && typeof item === "object" && !Object.isFrozen(item)) freeze(item); }); return Object.freeze(value); }
  root.CompassExams = freeze({ source, entries, subjects, matches, resolve });
})(globalThis);
