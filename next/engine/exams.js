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
  sourceUrl: "/notices/mse2-theory-2026.html",
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
  let code = String(branch || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) {
    const section = canonicalSection(value);
    code = section.match(/^(?:CS|IT|ME|CE|EE|EC|RAI|BBA|MBA|BCA|MCA|BVOC|BCOM)/)?.[0] || "";
  }
  if (code === "EC") return "ECE";
  if (code === "CS") return "CSE";
  if (code === "BCOM") return "B.COM";
  if (code === "BVOC") return "B.VOC";
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
  return label === wanted || (wanted === "ECE" && label === "ECE") || (wanted === "CSE" && label === "CSE")
    || (wanted === "BCOM" && label === "BCOM") || (wanted === "BVOC" && label === "BVOC");
}

function eseEntries(datesheet) {
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

export function examEventsForSelection({ datesheet, group, branch = "" } = {}) {
  const section = canonicalSection(group);
  const year = academicYearForSection(group);
  const selectedGroup = examGroupForSection(group);
  const selectedBranch = branchForSelection(group, branch);
  if (!section || !year) return [];
  return allPublishedExamEvents(datesheet).filter((event) => {
    if (event.year !== year) return false;
    if (event.sections) return year === 1 && event.sections.includes(section);
    if (year === 1 && selectedGroup) return event.tab === "Applied Sciences" && (!event.cohort || event.cohort === selectedGroup);
    return tabMatchesBranch(event.tab, selectedBranch);
  });
}

function compareExams(a, b) {
  return a.date.localeCompare(b.date)
    || (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER)
    || String(a.title).localeCompare(String(b.title));
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
