/* The old MSE-I date sheet was withdrawn from the active app data. */
(function (root) {
  "use strict";
  const source = Object.freeze({ title: "Exam schedule status", issued: null, url: "" });
  const matches = question => /\b(?:date\s*[- ]?sheets?|exam(?:s|inations?)?|mse\s*[- ]?\s*[123]?|paper(?:s)?)\b/i.test(String(question || ""))
    && !/\b(?:syllabus|marks?|pattern|calculator|credits?|results?|preparation|tips)\b/i.test(String(question || ""));
  function resolve(question) {
    if (!matches(question)) return null;
    const mse1 = /\bmse\s*[- ]?\s*(?:1|i)\b/i.test(String(question || ""));
    const message = mse1
      ? "MSE-I date-sheet data have been removed from Compass. No MSE-I exam schedule is available here."
      : "No current verified exam date sheet is available in Compass. Check the latest COE notice.";
    return { source, entries: [], sections: [], count: 0, message };
  }
  root.CompassExams = Object.freeze({ source, entries: Object.freeze([]), subjects: Object.freeze({}), matches, resolve });
})(globalThis);
