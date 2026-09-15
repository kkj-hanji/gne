# Compass verification and release — 15 September 2026

## Architecture and changes

The application is a vanilla browser application served by a Cloudflare Worker.
The Worker discovers, validates and proxies official sources; the browser parses
and indexes timetable/PDF data. Brain 1 (legacy), 1.2, 2 and 2.2 remain selectable.
The independent `legacyAnswerWithoutAi()` remains available. No LLM, embeddings
or inference API was added to any deterministic Brain.

The shared query entry points now route academic periods, supplied exam sittings
and timetable calculations before generic name lookup. This avoids implementing
four divergent copies of the same feature. Existing person/cohort comparisons,
holiday, syllabus, profile and timetable handlers remain in use.

- `public/schedule-analysis.js`: bounded operations for dated weekly views,
  counts, occupied minutes, day/teacher/room rankings with ties, and comparisons
  between two dates. Overlapping classes count as separate entries; occupied
  time uses the union of intervals. Unknown entities/qualifiers do not silently
  fall back to the active user's timetable. Requests are limited to 31 dates.
- `public/brain-kernel.js`: inclusive date ranges, reversed/oversized range
  validation, and preservation of date-comparison clauses during decomposition.
- `public/app.js`: connects these operations across all Brain modes and actual
  chat submission. Resolves personal day-only wording, prevents “Simple Card”
  becoming a student name, and distinguishes personal room rankings from room
  timetable lookup. Existing Enter/date-query regression checks remain passing.
- `public/academic-calendar.js`: transcribes the July–December 2026 academic
  periods, separating first-year, LEET and continuing cohorts. A conflicting
  current source URL/hash blocks the stored dates. Unpublished vacation dates
  and subject examination dates are not invented.
- `public/exam-schedule.js`: integrates the supplied MSE-I PDF independently
  from the weekly timetable, including the different EDG sittings. See
  [exam-date-sheet.md](exam-date-sheet.md) for provenance and update instructions.
- `public/index.html`, `public/sw.js`: load and cache the new modules and supplied
  PDF with a new application-shell revision.

## New roster issue found during live verification

The official index published new permanent-section PDFs dated 15 September.
They place registration number before CRN, move branch before student name, and
add a coordinator column. In two PDF rows, the text layer joins CRN + branch and
mentor phone + venue into single items. A blank parent cell also removes a token.
The earlier positional parser consequently returned zero or incomplete records.

`pdfTextFromItems()` now reconstructs columns when the complete new header is
recognized, preserving blank cells and separating only verified identifier/branch
and phone/venue field shapes. Other PDFs keep the previous text-extraction path.
The roster parser validates three permanent roster schemas plus legacy temporary
rosters. It retains only the student's existing public fields; parent and
coordinator columns are not imported. Unknown numbered table rows reject that
branch instead of presenting a partial count as complete. Schema revision 4
invalidates older parsing assumptions; PDF resources are destroyed after use.
Roster search source labels use roster filenames' dates rather than the weekly
timetable's effective date.

## Official research

- Current source selection: <https://appsc.gndec.ac.in/time_tables>. The effective
  timetable date remains 07-09-2026. Live HTML carries FET 7.10.5, generated
  13 September at 10:16 PM; that generator footer is not a new effective date.
- Current calendar: <https://gndec.ac.in/sites/default/files/acjul-dec26.pdf>,
  issued 28 July 2026, reference AS/81/2745. Its hash is recorded in the module.
- Calendar archive: <https://gndec.ac.in/?q=node/23>.
- Holidays: <https://gndec.ac.in/sites/default/files/LoH26.pdf> and
  <https://gndec.ac.in/?q=holidays>.
- Syllabus: <https://appsc.gndec.ac.in/node/27> and
  <https://appsc.gndec.ac.in/academics>. Existing verified study-scheme data is
  retained; an archived scheme must not replace the applicable batch's scheme.
- Faculty: <https://gndec.ac.in/faculty/>; regulations:
  <https://gndec.ac.in/?q=node/4>; facilities: <https://gndec.ac.in/?q=node/58>;
  brochure: <https://gndec.ac.in/sites/default/files/IB26.pdf>.
- University notices: <https://ptu.ac.in/noticeboard-main/>. The Profile shortcut
  now opens this noticeboard rather than the university homepage.

The supplied MSE-I document is labelled user-supplied, with its official web URL
pending. Merely appearing in a PDF does not prove a role holder is still current.
No HOD/dean/principal identities or rules were guessed from student names.

## Validation matrix

Final local run: `npm test` — 263 passed, zero failures; `npm run lint` passed;
`npm run build` passed. The live official entity matrix completed 2,250 queries
with zero failures across six view types and all seven current roster PDFs.

Automated coverage includes all four modes; 288 generated date-span questions
with exact date/entity/subject assertions; counts and interval arithmetic; ties;
two-date differences including room changes; all six official view types;
invalid, historical and year-boundary dates; revised academic sources; 18 exam
sections; missing documents/rooms/names; English/Hinglish/Punjabi wording;
four-part messages; actual form submission, Enter, clear-chat and Tomorrow-card
clicks; creator answers excluding admin details; old/new roster formats and all
seven branches; merged PDF cells and privacy of unneeded parent columns.

`scripts/verify-compass-live.mjs` is an explicit read-only network audit. It uses
the same application parser, verifies every numbered roster row, and compares
every published caption across weekly and Monday–Friday queries against actual
source rows. It does not save or print student identifiers.

The new roster record counts from that audit are CE 127, CS 379, EC 128, EE 128,
IT 191, ME 128, RAI 65. Counts describe these loaded documents, not an independently
verified total of every GNDEC student.

## Limits and follow-up work

This release is not an LLM and does not understand arbitrary language. Ambiguous
names and unsupported compound filters can still require clarification. Generic
named-person calculations over ranges need further resolver integration. Weekly
analytics describe the published pattern; holiday notices and date-specific
changes can override it. General academic periods are not subject date sheets.
New exam PDFs still need transcription and tests before publication.

The in-app browser execution tool was unavailable during this release. DOM/form
tests cover interaction behavior; a visual desktop/mobile review is not claimed.
GitHub Actions and the proposed UI/admin/brain improvements were discussion-only;
no workflow or proposed feature was implemented as part of those recommendations.
