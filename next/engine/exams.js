/** Published exam sittings used by the Next dashboard and date-day view. */

const CHEMISTRY_SECTIONS = Object.freeze(["CSA", "CSB", "CSC", "CSD", "CSE", "CSF", "ITA", "ITB", "ITC"]);
const PHYSICS_SECTIONS = Object.freeze(["MEA", "MEB", "CEA", "CEB", "EEA", "EEB", "ECA", "ECB", "RAI"]);

export function examGroupForSection(value) {
  if (academicYearForSection(value) !== 1) return "";
  const section = canonicalSection(value);
  if (CHEMISTRY_SECTIONS.includes(section)) return "Chemistry group";
  if (PHYSICS_SECTIONS.includes(section)) return "Physics group";
  return "";
}

const theory = (id, group, date, subject, start, end, sections) => Object.freeze({
  id, category: "MSE-II theory", title: subject, date, start, end, sections, group,
  sourceLabel: "Applied Sciences · transcribed",
  // Link to the exact bundled page so the PWA never has to guess an SPA route.
  sourceUrl: "/notices/mse2-theory-2026",
  sourceNote: "Transcribed from user-supplied notice APS/11/2368. Verify any later revision."
});

const workshop = (id, section, date, title, start, end) => Object.freeze({
  id, category: "MSE-II workshop", title, date, start, end, sections: Object.freeze([section]),
  sourceLabel: "MP workshops · transcribed",
  sourceUrl: "/notices/mse2-workshops-2026.html",
  sourceNote: "Transcribed from the supplied workshop schedule. Verify any later revision."
});

export const TRANSCRIBED_EXAMS = Object.freeze([
  theory("mse2-chem-math", "chemistry", "2026-11-23", "Mathematics-I", 555, 645, CHEMISTRY_SECTIONS),
  theory("mse2-chem-pps", "chemistry", "2026-11-25", "PPS", 555, 645, CHEMISTRY_SECTIONS),
  theory("mse2-chem-chemistry", "chemistry", "2026-11-26", "Chemistry", 555, 645, CHEMISTRY_SECTIONS),
  theory("mse2-chem-english", "chemistry", "2026-11-27", "English", 555, 645, CHEMISTRY_SECTIONS),
  theory("mse2-chem-beee", "chemistry", "2026-11-28", "BEEE", 555, 645, CHEMISTRY_SECTIONS),
  theory("mse2-phy-math", "physics", "2026-11-23", "Mathematics-I", 555, 645, PHYSICS_SECTIONS),
  theory("mse2-phy-pps", "physics", "2026-11-25", "PPS", 555, 645, PHYSICS_SECTIONS),
  theory("mse2-phy-physics", "physics", "2026-11-26", "Physics", 765, 855, PHYSICS_SECTIONS),
  theory("mse2-phy-economics", "physics", "2026-11-27", "Economics", 765, 855, PHYSICS_SECTIONS),
  theory("mse2-phy-edg-me", "physics", "2026-11-28", "EDG · Engineering Drawing", 660, 750, Object.freeze(["MEA", "MEB", "CEA", "CEB", "RAI"])),
  theory("mse2-phy-edg-ee", "physics", "2026-11-28", "EDG · Engineering Drawing", 780, 870, Object.freeze(["EEA", "EEB", "ECA", "ECB"])),
  workshop("mse2-workshop-meb", "MEB", "2026-11-18", "MP (Workshop) · periods 3–4", 630, 750),
  workshop("mse2-workshop-mea", "MEA", "2026-11-19", "MP (Workshop) · periods 1–2", 510, 630),
  workshop("mse2-workshop-rai", "RAI", "2026-11-19", "MP (Workshop) · periods 1–2", 510, 630),
  workshop("mse2-workshop-ceb", "CEB", "2026-11-19", "MP (Workshop) · periods 7–8", 870, 990),
  workshop("mse2-workshop-eca", "ECA", "2026-11-19", "MP (Workshop) · periods 7–8", 870, 990),
  workshop("mse2-workshop-cea", "CEA", "2026-11-20", "MP (Workshop) · periods 3–4", 630, 750),
  workshop("mse2-workshop-eea", "EEA", "2026-11-20", "MP (Workshop) · periods 5–6", 750, 870),
  workshop("mse2-workshop-ecb", "ECB", "2026-11-20", "MP (Workshop) · periods 5–6", 750, 870),
  workshop("mse2-workshop-eeb", "EEB", "2026-11-20", "MP (Workshop) · periods 7–8", 870, 990)
]);

function canonicalSection(value) {
  let code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^D[1-4]/, "");
  code = code.replace(/^ECE/, "EC").replace(/^CSE/, "CS");
  return code;
}

export function academicYearForSection(value) {
  const match = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^D([1-4])/);
  if (match) return Number(match[1]);
  const section = canonicalSection(value);
  return CHEMISTRY_SECTIONS.includes(section) || PHYSICS_SECTIONS.includes(section) ? 1 : null;
}

function branchForSelection(value, branch = "") {
  const raw = String(branch || value || "").toUpperCase();
  const compact = String(branch ? raw.replace(/[^A-Z0-9]/g, "") : canonicalSection(raw)).replace(/[^A-Z0-9]/g, "");
  if (/LATERAL ENTRY|WORKING PROFESSIONAL/.test(raw)) {
    if (/CIVIL|\bCE\b/.test(raw)) return "CE-LE-WP";
    if (/MECHANICAL|\bME\b/.test(raw)) return "ME-LE-WP";
  }
  if (/M\.?\s*TECH/.test(raw)) {
    if (/COMPUTER\s*SCIENCE\s*(?:AND|&)\s*INFORMATION\s*TECHNOLOGY/.test(raw)) return "MTECH-CSIT";
    if (/COMPUTER\s*SCIENCE|\bCSE\b/.test(raw)) return "MTECH-CSE";
    if (/ELECTRONICS|\bECE\b|\bEC\b/.test(raw)) return "MTECH-ECE";
    if (/ELECTRICAL|\bEE\b/.test(raw)) return "MTECH-EE";
    if (/POWER/.test(raw)) return "MTECH-POWER";
    if (/PRODUCTION/.test(raw)) return "MTECH-PE";
    if (/STRUCTURAL/.test(raw)) return "MTECH-SE";
    if (/INFORMATION\s*TECHNOLOGY|\bIT\b/.test(raw)) return "MTECH-IT";
    if (/VLSI/.test(raw)) return "MTECH-VLSI";
    if (/ENVIRONMENT/.test(raw)) return "MTECH-ENV";
    if (/INDUSTRIAL/.test(raw)) return "MTECH-IE";
    if (/GEO.?TECH/.test(raw)) return "MTECH-GEOTECH";
    if (/SOIL|FOUNDATION/.test(raw)) return "MTECH-SMFE";
    if (/ENERGY/.test(raw)) return "MTECH-ENERGY";
    if (/MECHANICAL/.test(raw)) return "MTECH-ME";
  }
  if (/P\.?\s*H\.?\s*D/.test(raw)) {
    if (/COMPUTER\s*SCIENCE|\bCSE\b/.test(raw)) return "PHD-CSE";
    if (/CIVIL|\bCE\b/.test(raw)) return "PHD-CE";
    if (/ELECTRONICS|\bECE\b|\bEC\b/.test(raw)) return "PHD-ECE";
  }
  if (/ROBOTICS|\bRAI\b/.test(raw)) return "RAI";
  if (/B\.?\s*COM|COMMERCE/.test(raw)) return "BCOM";
  if (/B\.?\s*VOC|VOCATIONAL/.test(raw)) return "BVOC";
  if (/B\.?\s*CA|COMPUTER\s*APPLICATION/.test(raw)) return "BCA";
  if (/B\.?\s*BA|BUSINESS\s*ADMINISTRATION/.test(raw)) return "BBA";
  if (/MINOR/.test(raw)) {
    if (/COMPUTER\s*SCIENCE|\bCSE\b/.test(raw)) return "MINOR-CSE";
    if (/INFORMATION\s*TECHNOLOGY|\bIT\b/.test(raw)) return "MINOR-IT";
    if (/ELECTRONICS|\bECE\b|\bEC\b/.test(raw)) return "MINOR-ECE";
    if (/ELECTRICAL|\bEE\b/.test(raw)) return "MINOR-EE";
  }
  if (/CIVIL|\bCE\b/.test(raw)) return "CE";
  if (/COMPUTER\s*SCIENCE|\bCSE\b|\bCS\b/.test(raw)) return "CSE";
  if (/ELECTRONICS|\bECE\b|\bEC\b/.test(raw)) return "ECE";
  if (/ELECTRICAL|\bEE\b/.test(raw)) return "EE";
  if (/INFORMATION\s*TECHNOLOGY|\bIT\b/.test(raw)) return "IT";
  if (/MECHANICAL|\bME\b/.test(raw)) return "ME";
  if (/PRODUCTION/.test(raw)) return /MECHANICAL/.test(raw) ? "MEP" : "PE";
  if (/BUSINESS\s*ADMINISTRATION|\bMBA\b/.test(raw)) return "MBA";
  if (/\bMCA\b/.test(raw)) return "MCA";
  if (/\bBBA\b/.test(raw)) return "BBA";
  const code = compact.match(/^(?:CS|IT|ME|CE|EE|EC|RAI|BBA|MBA|BCA|MCA|BVOC|BCOM)/)?.[0] || compact;
  if (code === "EC") return "ECE";
  if (code === "CS") return "CSE";
  if (code === "BCOM") return "BCOM";
  if (code === "BVOC") return "BVOC";
  return code;
}

function semesterYear(entry, tabLabel = "") {
  const semester = Number(entry.semesterNumber);
  if (Number.isFinite(semester) && semester > 0) return Math.ceil(semester / 2);
  return String(tabLabel).trim().toLowerCase() === "applied sciences" ? 1 : null;
}

function normalizedGroup(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("chemistry")) return "Chemistry group";
  if (text.includes("physics")) return "Physics group";
  return "";
}

function tabMatchesBranch(tab, branch) {
  const label = String(tab || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const wanted = String(branch || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!wanted) return false;
  return label === wanted || label.startsWith(wanted) && /^(?:MTECH|PHD|MINOR)/.test(label);
}

function schemeYear(value) {
  const match = String(value || "").match(/20\d{2}/);
  return match ? Number(match[0]) : 0;
}

function latestSchemeEntries(entries) {
  const newestBySemester = new Map();
  for (const entry of entries || []) {
    const semester = Number(entry.semesterNumber || entry.semester);
    const year = schemeYear(entry.schemeCode);
    if (!semester || !year) continue;
    newestBySemester.set(semester, Math.max(newestBySemester.get(semester) || 0, year));
  }
  return (entries || []).filter((entry) => {
    const semester = Number(entry.semesterNumber || entry.semester);
    const newest = newestBySemester.get(semester) || 0;
    const year = schemeYear(entry.schemeCode);
    return !newest || !year || year === newest;
  });
}

function eseEntries(datesheet) {
  if (Array.isArray(datesheet?.programmes)) {
    return datesheet.programmes.flatMap((programme) => latestSchemeEntries(programme.entries || []).map((entry) => ({
      id: `ese-${programme.id}-${programme.studyMode}-${entry.semesterNumber}-${entry.date}-${entry.subjectCode}-${entry.schemeCode}`,
      category: "Provisional ESE 2026",
      title: entry.subject || "Examination",
      date: entry.date || "",
      start: Number.isFinite(entry.sessionStart) ? entry.sessionStart : null,
      end: Number.isFinite(entry.sessionEnd) ? entry.sessionEnd : null,
      tab: programme.code || programme.label || "",
      tabLabel: programme.label || "",
      programmeId: programme.id || "",
      studyMode: programme.studyMode || "",
      semester: Number(entry.semesterNumber || entry.semester) || null,
      semesterNumber: Number(entry.semesterNumber || entry.semester) || null,
      schemeCode: entry.schemeCode || "",
      subjectCode: entry.subjectCode || "",
      paperId: entry.paperId || "",
      sessionRaw: entry.sessionRaw || "",
      year: semesterYear(entry, programme.label),
      sourceLabel: "Official provisional December 2026 ESE datesheet",
      sourceUrl: datesheet?.source?.url || "https://academics.gndec.ac.in/datesheet/"
    })));
  }

  return (datesheet?.tabs || []).flatMap((tab) => (tab.entries || []).map((entry) => {
    const sourceUrl = datesheet?.source?.url
      ? `${datesheet.source.url}${tab.gid ? `#gid=${encodeURIComponent(tab.gid)}` : ""}`
      : "";
    return {
      id: `ese-${tab.id || tab.label}-${entry.date}-${entry.subject}-${entry.header || ""}`,
      category: "End-semester exam",
      title: entry.subject || "Examination",
      date: entry.date || "",
      start: Number.isFinite(entry.sessionStart) ? entry.sessionStart : null,
      end: Number.isFinite(entry.sessionEnd) ? entry.sessionEnd : null,
      tab: tab.label || "",
      sessionRaw: entry.sessionRaw || "",
      sessionNote: entry.sessionNote || "",
      semester: Number(entry.semesterNumber || entry.semester) || null,
      semesterNumber: Number(entry.semesterNumber || entry.semester) || null,
      year: semesterYear(entry, tab.label),
      cohort: normalizedGroup(entry.qualifier || entry.header),
      sourceLabel: "Official tentative ESE sheet",
      sourceUrl
    };
  }).filter(Boolean));
}

export function allPublishedExamEvents(datesheet) {
  return [...TRANSCRIBED_EXAMS.map((event) => ({ ...event, year: 1, cohort: normalizedGroup(event.group) })), ...eseEntries(datesheet)]
    .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .sort(compareExams);
}

export function examEventsForSelection({ datesheet, group, branch = "", semester = "" } = {}) {
  const section = canonicalSection(group);
  const sectionYear = academicYearForSection(group);
  const selectedGroup = examGroupForSection(group);
  const selectedBranch = branchForSelection(group, branch);
  const selectedSemester = Number(String(semester || "").match(/\d{1,2}/)?.[0]) || 0;
  const selectedYear = selectedSemester ? Math.ceil(selectedSemester / 2) : sectionYear;
  if ((!section || !selectedYear) && !selectedBranch) return [];
  return allPublishedExamEvents(datesheet).filter((event) => {
    if (event.sections) return selectedYear === 1 && event.sections.includes(section);
    if (event.semesterNumber) {
      if (selectedSemester && event.semesterNumber !== selectedSemester) return false;
      if (!selectedSemester && selectedYear && Math.ceil(event.semesterNumber / 2) !== selectedYear) return false;
      return selectedBranch ? tabMatchesBranch(event.tab, selectedBranch) : Boolean(selectedYear);
    }
    if (!selectedYear || event.year !== selectedYear) return false;
    if (selectedYear === 1 && selectedGroup && event.tab === "Applied Sciences") {
      return !event.cohort || event.cohort === selectedGroup;
    }
    return tabMatchesBranch(event.tab, selectedBranch);
  });
}

/**
 * Workshop and practical rows are notice items, not day-replacing exams.
 * Only theory, mid-semester and end-semester papers replace the timetable.
 */
export function isImportantExam(event) {
  const label = `${event?.category || ""} ${event?.title || ""}`.toLowerCase();
  if (/workshop|practical|lab/.test(label)) return false;
  return /\bmse\b|end[- ]?sem(?:ester)?|\bfinal\b|\btentative\b|\bese\b/.test(label);
}

/** Theory/final sittings for one verified section selection. */
export function importantExamEventsForSelection({ datesheet, group, branch = "", semester = "" } = {}) {
  return examEventsForSelection({ datesheet, group, branch, semester }).filter(isImportantExam);
}

/** Keep separate published MSE-II and ESE sheets readable when both apply. */
export function groupExamDatesheetEvents(events) {
  const groups = new Map();
  for (const exam of events || []) {
    const category = String(exam?.category || "");
    const key = /mse\s*[-–]?\s*(?:ii|2)/i.test(category) ? "mse"
      : /end[- ]?sem(?:ester)?|\bese\b/i.test(category) ? "ese"
        : `other:${category || "Published exams"}`;
    if (!groups.has(key)) groups.set(key, {
      label: key === "mse" ? "MSE-II datesheet" : key === "ese" ? "ESE datesheet" : key.slice(6),
      events: []
    });
    groups.get(key).events.push(exam);
  }
  const rank = (key) => key === "mse" ? 0 : key === "ese" ? 1 : 2;
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([, group]) => group);
}

function compareExams(a, b) {
  return a.date.localeCompare(b.date)
    || (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER)
    || String(a.title).localeCompare(String(b.title));
}

function shiftISODate(dateISO, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO || "")) return "";
  const date = new Date(`${dateISO}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== dateISO) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Activate the Today date sheet three days early and keep it through the final paper. */
export function examDateSheetPeriod(events, { dateISO, minutes = 0, leadDays = 3 } = {}) {
  const exams = [...(events || [])].sort(compareExams);
  const firstDate = exams[0]?.date || "";
  const startDate = shiftISODate(firstDate, -Math.max(0, Math.min(14, Number(leadDays) || 0)));
  const remaining = exams.filter((event) => event.date > dateISO
    || (event.date === dateISO && (event.end == null || event.end > minutes)));
  return {
    active: Boolean(startDate && dateISO >= startDate && remaining.length),
    startDate,
    exams,
    remaining,
    today: exams.filter((event) => event.date === dateISO && (event.end == null || event.end > minutes)).sort(compareExams),
    next: remaining[0] || null
  };
}

/** Keep an in-progress sitting visible; advance as soon as its published start time arrives. */
export function nextUpcomingExam(events, { dateISO, minutes = 0 } = {}) {
  return [...(events || [])]
    .filter((event) => event.date > dateISO || (event.date === dateISO && (event.start == null || event.start > minutes)))
    .sort(compareExams)[0] || null;
}

export function examsOnDate(events, dateISO) {
  return [...(events || [])].filter((event) => event.date === dateISO).sort(compareExams);
}

export function examTimeLabel(event, formatTime = (minutes) => String(minutes)) {
  if (event.start == null || event.end == null) return event.sessionRaw || "Time not listed";
  return `${formatTime(event.start)}–${formatTime(event.end)}`;
}
