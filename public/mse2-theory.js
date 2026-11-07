/* MSE-II Semester I theory date sheet transcribed from a user-supplied
 * photograph of the GNDEC Department of Applied Sciences notice APS/11/2368,
 * dated 3 November 2026. No matching official web publication was verified. */
(function (root) {
  "use strict";

  const source = Object.freeze({
    title: "MSE-II \u00b7 Semester I \u00b7 Theory Date Sheet \u00b7 November 2026",
    issued: "2026-11-03",
    reference: "APS/11/2368",
    department: "Applied Sciences",
    url: "/notices/mse2-theory-2026.html",
    provenance: "Transcribed from the user-supplied GNDEC Applied Sciences date-sheet photograph dated 3 November 2026. The photographed page prints no room, venue, seat, or reporting time. Official web publication was not independently verified."
  });

  const groupSections = Object.freeze({
    chemistry: Object.freeze(["CSA", "CSB", "CSC", "CSD", "CSE", "CSF", "ITA", "ITB", "ITC"]),
    physics: Object.freeze(["MEA", "MEB", "CEA", "CEB", "EEA", "EEB", "ECA", "ECB", "RAI"])
  });

  const groups = Object.freeze({
    chemistry: Object.freeze({
      id: "chemistry",
      label: "Chemistry Group",
      sectionsLabel: "CS A\u2013F, IT A\u2013C",
      sections: groupSections.chemistry
    }),
    physics: Object.freeze({
      id: "physics",
      label: "Physics Group",
      sectionsLabel: "ME A\u2013B, CE A\u2013B, EE A\u2013B, EC A\u2013B, RAI",
      sections: groupSections.physics
    })
  });

  const entry = (id, group, date, subject, label, start, end, sections, sectionsLabel) => Object.freeze({
    id, group, date, subject, label, start, end,
    sections: Object.freeze([...sections]),
    sectionsLabel
  });

  const entries = Object.freeze([
    entry("mse2-chem-math", "chemistry", "2026-11-23", "math", "Mathematics-I", 555, 645, groupSections.chemistry, groups.chemistry.sectionsLabel),
    entry("mse2-chem-pps", "chemistry", "2026-11-25", "pps", "PPS", 555, 645, groupSections.chemistry, groups.chemistry.sectionsLabel),
    entry("mse2-chem-chemistry", "chemistry", "2026-11-26", "chemistry", "Chemistry", 555, 645, groupSections.chemistry, groups.chemistry.sectionsLabel),
    entry("mse2-chem-english", "chemistry", "2026-11-27", "english", "English", 555, 645, groupSections.chemistry, groups.chemistry.sectionsLabel),
    entry("mse2-chem-beee", "chemistry", "2026-11-28", "beee", "BEEE", 555, 645, groupSections.chemistry, groups.chemistry.sectionsLabel),

    entry("mse2-phy-math", "physics", "2026-11-23", "math", "Mathematics-I", 555, 645, groupSections.physics, groups.physics.sectionsLabel),
    entry("mse2-phy-pps", "physics", "2026-11-25", "pps", "PPS", 555, 645, groupSections.physics, groups.physics.sectionsLabel),
    entry("mse2-phy-physics", "physics", "2026-11-26", "physics", "Physics", 765, 855, groupSections.physics, groups.physics.sectionsLabel),
    entry("mse2-phy-economics", "physics", "2026-11-27", "economics", "Economics", 765, 855, groupSections.physics, groups.physics.sectionsLabel),
    entry("mse2-phy-edg-me", "physics", "2026-11-28", "edg", "EDG", 660, 750, ["MEA", "MEB", "CEA", "CEB", "RAI"], "ME A\u2013B, CE A\u2013B, RAI"),
    entry("mse2-phy-edg-ee", "physics", "2026-11-28", "edg", "EDG", 780, 870, ["EEA", "EEB", "ECA", "ECB"], "EE A\u2013B, EC A\u2013B")
  ]);

  const normalize = (value) => String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const isMse2Question = (value) => /\b(?:mse|mst)\s*-?\s*(?:2|ii)\b|\b(?:second|2nd)\s+(?:mse|mst|mid\s*sem(?:ester)?)\b/.test(normalize(value));
  const isMse1Question = (value) => /\b(?:mse|mst)\s*-?\s*(?:1|i)\b|\b(?:first|1st)\s+(?:mse|mst|mid\s*sem(?:ester)?)\b/.test(normalize(value));
  const isScheduleQuestion = (value) => /\b(?:date\s*-?\s*sheet|datesheet|theory|written|paper|exam(?:s|ination)?|test|schedule|sitting)\b/.test(normalize(value));

  function matches(question) {
    const q = normalize(question);
    if (isMse1Question(q)) return false;
    const appliedSciences = /\bapplied\s*sciences?\b/.test(q) && isScheduleQuestion(q);
    const explicitGroup = /\b(?:chemistry|physics)\s+group\b/.test(q) && isScheduleQuestion(q);
    return isMse2Question(q) || appliedSciences || explicitGroup;
  }

  function groupForSection(section) {
    const code = String(section || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!code) return "";
    if (groupSections.chemistry.includes(code)) return "chemistry";
    if (groupSections.physics.includes(code)) return "physics";
    return "";
  }

  function requestedSections(question) {
    const q = normalize(question);
    const found = new Set();
    // Compact forms: CSA, CS A1, MEB2, RAI, RAI2.
    for (const match of q.matchAll(/\b(cs|cse|it|me|ce|ee|ec|ece|rai)\s*[- ]?\s*([a-f])(?:[ -]?([12]))?\b/g)) {
      const branch = ({ cse: "CS", ece: "EC" })[match[1]] || match[1].toUpperCase();
      if (branch === "RAI") continue;
      found.add(`${branch}${match[2].toUpperCase()}`);
    }
    // Compact forms without a separating space are unambiguous for every branch.
    for (const match of q.matchAll(/\b(cs|it|me|ce|ee|ec|ece|rai)([a-f])([12])?\b/g)) {
      const branch = ({ cse: "CS", ece: "EC" })[match[1]] || match[1].toUpperCase();
      if (branch === "RAI") {
        found.add("RAI");
        continue;
      }
      found.add(`${branch}${match[2].toUpperCase()}`);
    }
    if (/\brai(?:[ -]?[12])?\b/.test(q)) found.add("RAI");
    return [...found].filter(groupForSection);
  }

  function subjectKeys(question) {
    const q = normalize(question).replace(/\b(?:chemistry|physics)\s+group\b/g, " ");
    const keys = [];
    if (/\b(?:edg|engineering\s+drawing|drawing|graphics)\b/.test(q)) keys.push("edg");
    if (/\b(?:beee|bee|basic\s+electrical|electrical)\b/.test(q)) keys.push("beee");
    if (/\b(?:pps|programming\s+for\s+problem\s+solving|programming)\b/.test(q)) keys.push("pps");
    if (/\b(?:chemistry|chem)\b/.test(q)) keys.push("chemistry");
    if (/\b(?:english|eng)\b/.test(q)) keys.push("english");
    if (/\b(?:physics|phy)\b/.test(q)) keys.push("physics");
    if (/\b(?:economics|economics?|eco)\b/.test(q)) keys.push("economics");
    if (/\b(?:maths?|mathematics|math-?i)\b/.test(q)) keys.push("math");
    return [...new Set(keys)];
  }

  function resolve(question, context = {}) {
    const q = normalize(question);
    if (!matches(q)) return null;

    let groupIds = [];
    if (/\bchemistry\s+group\b/.test(q)) groupIds.push("chemistry");
    if (/\bphysics\s+group\b/.test(q)) groupIds.push("physics");

    const sections = requestedSections(q);
    for (const section of sections) {
      const group = groupForSection(section);
      if (group && !groupIds.includes(group)) groupIds.push(group);
    }

    const own = /\b(?:my|mine|mera|meri|mera|apna)\b/.test(q);
    if (own && !sections.length && !groupIds.length && context.section) {
      const group = groupForSection(context.section);
      if (group) {
        groupIds.push(group);
        sections.push(String(context.section).toUpperCase());
      }
    }

    if (!groupIds.length) groupIds = ["chemistry", "physics"];
    groupIds = [...new Set(groupIds)];

    let selected = entries.filter((row) => groupIds.includes(row.group));
    if (sections.length) selected = selected.filter((row) => row.sections.some((section) => sections.includes(section)));

    const subject = subjectKeys(q);
    if (subject.length && !/\b(?:all|full|both|complete|entire)\b/.test(q)) {
      for (const key of subject) {
        const subjectMatches = selected.filter((row) => row.subject === key);
        if (!subjectMatches.length) {
          return {
            source,
            groups: groupIds.map((id) => groups[id]),
            entries: [],
            sections,
            message: `${groups[groupIds[0]].label} does not study ${key === "edg" ? "EDG" : key.toUpperCase()} in the supplied MSE-II theory date sheet. That does not establish that no other examination exists.`
          };
        }
        selected = subjectMatches;
      }
    }

    const dates = context.temporal?.dates || [];
    if (dates.length) {
      const range = dates.length === 2 && /\b(?:from|between|to|through)\b/.test(q);
      const sorted = [...dates].sort();
      selected = selected.filter((row) => range ? row.date >= sorted[0] && row.date <= sorted[1] : dates.includes(row.date));
    }

    const messages = [];
    if (!sections.length && groupIds.length === 2) messages.push("The photograph prints separate Chemistry Group and Physics Group tables.");
    if (selected.some((row) => row.subject === "edg")) messages.push("EDG has two sittings on 28 November: ME/CE/RAI at 11:00 AM and EE/EC at 1:00 PM.");
    if (!selected.length) messages.push("No matching sitting is listed in the supplied MSE-II theory date sheet. This does not establish that no examination exists.");
    else messages.push("The photographed page prints no room, venue, seat, or reporting time. Later notices may revise this schedule.");

    return {
      source,
      groups: groupIds.map((id) => groups[id]),
      entries: selected,
      sections,
      message: messages.join(" ")
    };
  }

  root.CompassMse2Theory = Object.freeze({
    source,
    groups,
    entries,
    matches,
    isMse1Question,
    groupForSection,
    resolve
  });
})(globalThis);
