/* Decisions transcribed from a user-supplied photograph of GNDEC HOD meeting
 * minutes. The photo is dated 3 November 2026; no matching web publication has
 * been independently verified. */
(function (root) {
  "use strict";
  const source = Object.freeze({
    title: "HOD meeting minutes \u00b7 issued 3 November 2026",
    url: "/notices/hod-meeting-2026-11-03.html",
    provenance: "Transcribed from the user-supplied GNDEC letterhead photo. The photographed copy is marked circulated on 3 November 2026; independent web verification was not available."
  });
  const decisions = Object.freeze([
    Object.freeze({ id: "mst2", title: "Second MST", text: "The second MST is scheduled to start on 21 November 2026 and finish by 28 November 2026. The notice says the need-based third test will be decided by HODs at department level. MST-3 should cover the syllabi of MST-1 and MST-2. Exact subject-wise sittings are not listed in these minutes." }),
    Object.freeze({ id: "ese", title: "End-semester examinations", text: "The notice says end-semester examinations will start on 4 December 2026. It asks the COE to ensure timely display of the date sheet. Subject-wise examination dates are not included in these minutes." }),
    Object.freeze({ id: "attendance", title: "Attendance and syllabus coverage", text: "HODs are asked to assess attendance and syllabus coverage, and arrange additional classes before end-semester examinations so students can complete the attendance requirement." }),
    Object.freeze({ id: "industry", title: "Faculty training and research", text: "Departments are asked to arrange faculty internships or industry training during December 2026 or January 2027. The minutes also encourage faculty and students to apply for college seed research grants and sponsored research projects from ANRF and other funding agencies." }),
    Object.freeze({ id: "practice", title: "Professor of Practice proposals", text: "Departments are asked to explore a Professor of Practice scheme with industry experts and send a list of relevant experts to the Principal's office by 30 November 2026." }),
    Object.freeze({ id: "working-days", title: "November working days and holiday", text: "The minutes designate Saturday, 21 November 2026 and Saturday, 28 November 2026 as working days. Tuesday, 10 November 2026 is declared a holiday in lieu of 21 November." })
  ]);
  const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").trim();
  const triggers = Object.freeze([
    ["mst2", /\b(?:mst\s*-?\s*(?:2|ii)|second\s+(?:mst|mid\s*sem)|2nd\s+(?:mst|mid\s*sem)|mst\s*3|third\s+(?:mst|test)|3rd\s+(?:mst|test))\b/],
    ["ese", /\b(?:end\s*[- ]?sem(?:ester)?|ese|final\s+exam|end\s+semester\s+exam)/],
    ["attendance", /\b(?:attendance|syllabus\s+coverage|additional\s+classes|extra\s+classes)\b/],
    ["industry", /\b(?:faculty\s+(?:internship|training)|industry\s+training|seed\s+(?:research\s+)?grant|anrf|sponsored\s+research|december\s*\/\s*jan|dec\s*\/\s*jan)\b/],
    ["practice", /\b(?:professor\s+of\s+practice|industry\s+experts?|expert\s+list|30\s+nov(?:ember)?|30th\s+nov(?:ember)?)\b/],
    ["working-days", /\b(?:working\s+days?|working\s+saturdays?|holiday\s+in\s+lieu|in\s+lieu|10\s*[./-]\s*11|10\s+nov(?:ember)?|nov(?:ember)?\s+10|21\s+nov(?:ember)?|nov(?:ember)?\s+21|28\s+nov(?:ember)?|nov(?:ember)?\s+28)\b/]
  ]);
  function matches(question) {
    const q = normalize(question);
    return triggers.some(([, pattern]) => pattern.test(q))
      || /\b(?:hod\s+meeting|meeting\s+minutes|minutes\s+of\s+meeting|mom\s+of\s+hod|circular\s+dated\s+3\s+nov)\b/.test(q);
  }
  function resolve(question) {
    const q = normalize(question);
    if (!matches(q)) return null;
    const requested = triggers.filter(([, pattern]) => pattern.test(q)).map(([id]) => id);
    const explicitMinutes = /\b(?:hod\s+meeting|meeting\s+minutes|minutes\s+of\s+meeting|mom\s+of\s+hod|circular|photographed\s+notice)\b/.test(q);
    if (!explicitMinutes && requested.length && requested.every(id => id === "ese")) return null;
    const broad = /\b(?:all\s+(?:decisions|points)|full\s+(?:minutes|notice)|meeting\s+minutes|minutes\s+of\s+meeting|hod\s+meeting|mom\s+of\s+hod|what\s+does\s+the\s+notice\s+say|summari[sz]e)\b/.test(q);
    const selected = broad ? decisions : decisions.filter(item => requested.includes(item.id));
    if (!selected.length) return { source, decisions, message: "These are the six decisions transcribed from the supplied meeting-minutes photo." };
    return { source, decisions: selected, message: "Exact subject-wise MST and end-semester date sheets are not present in this meeting-minutes photo." };
  }
  root.CompassAcademicNotices = Object.freeze({ source, decisions, matches, resolve });
})(globalThis);
