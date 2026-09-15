# MSE-I date sheet

The user supplied `Date Sheet.pdf` and requested its inclusion on 15 September
2026. The document is dated 14 September 2026 and identifies GNDEC's Department
of Applied Sciences as issuer. It covers Semester I MSE-I, 25 September through
1 October 2026. A matching official public URL has not been established.

`public/data/mse1-sem1-2026-09-14.pdf` preserves the original bytes. Its SHA-256
hash is recorded with the structured data in `public/exam-schedule.js` and checked
by tests. Do not mark this as an independently web-verified source. Answers and
the Profile link identify it as a supplied document.

The 11 printed rows apply to 18 sections. Chemistry-group sections are CSA–CSF
and ITA–ITC. Physics-group sections are MEA, MEB, CEA, CEB, EEA, EEB, ECA, ECB
and RAI. EDG has two different sittings on 30 September: CE/ME/RAI at 09:15;
EC/EE at 11:00. All times are Asia/Kolkata. Rooms, seating, invigilators, exam
syllabus and cancellation of regular classes are absent from this document.

`CompassExams.resolve` filters the structured records by section, subject and
date, and computes duration/current/next exam deterministically. The application
adapter uses the active timetable section and loaded subsection mappings. It
runs before student/faculty/timetable lookup, across all Brain settings, in the
chat submission path, local-answer path and independent legacy fallback. These
exam records do not replace or modify the weekly FET timetable or holiday data.

The module and PDF are included in the service-worker shell for offline use.
An unlisted date means no exam is listed in this source, not that college is closed.
Unsupported sessions and unresolved entities return scoped missing-data answers.

## Updating

1. Preserve this PDF when another notice arrives. Add the new document under a
   distinct filename, record its issue date, provenance and hash, and establish
   which semester, exam and sections it supersedes.
2. Update the source metadata and affected structured rows in the exam module;
   add only the room/seating/other details actually present in the new source.
   The visible title and issue date come from the source metadata.
3. Update document links, script revision and service-worker revision together.
4. Update the source/transcription assertions and section/date tests; run
   `npm test`, `npm run lint` and `npm run build` before release.

This is a bundled document, so new exam notices are not automatically discovered
by the existing timetable refresh job.
