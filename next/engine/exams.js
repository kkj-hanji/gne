/** Published exam sittings used by the Next dashboard and date-day view. */

const CHEMISTRY_SECTIONS = Object.freeze(["CSA", "CSB", "CSC", "CSD", "CSE", "CSF", "ITA", "ITB", "ITC"]);
const PHYSICS_SECTIONS = Object.freeze(["MEA", "MEB", "CEA", "CEB", "EEA", "EEB", "ECA", "ECB", "RAI"]);

export function examGroupForSection(value) {
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
  let code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^D[23]/, "");
  code = code.replace(/^ECE/, "EC").replace(/^CSE/, "CS");
  return code;
}

function eseEntries(datesheet, section) {
  const chemistry = CHEMISTRY_SECTIONS.includes(section);
  const physics = PHYSICS_SECTIONS.includes(section);
  return (datesheet?.tabs || []).flatMap((tab) => (tab.entries || []).map((entry) => {
    const qualifier = String(entry.qualifier || entry.header || "").toLowerCase();
    if (qualifier.includes("chemistry group") && physics) return null;
    if (qualifier.includes("physics group") && chemistry) return null;
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
      sourceLabel: "Official tentative ESE sheet",
      sourceUrl
    };
  }).filter(Boolean));
}

export function examEventsForSelection({ datesheet, group } = {}) {
  const section = canonicalSection(group);
  const transcribed = section
    ? TRANSCRIBED_EXAMS.filter((event) => event.sections.includes(section))
    : [];
  return [...transcribed, ...eseEntries(datesheet, section)]
    .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
    .sort(compareExams);
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
