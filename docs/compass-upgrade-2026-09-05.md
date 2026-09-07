# Ask Compass upgrade and verification report

## Findings

Compass already had a browser application, an independent legacy answer function, three deterministic Brain engines, and a shared kernel. The Cloudflare Worker discovers and validates official timetable, roster, syllabus, and calendar sources. Student profiles and timetable selections live on the device. External AI is a separate optional feature, not a dependency of Brain.

The main defects found were at boundaries: chat-only decomposition, lost secondary questions, missing timetable verbs, room-code overcorrection, ambiguous name resolution, inconsistent date parsers, 24-hour time wrapping, stale credit constants, and comparisons that overwrote parallel classes sharing a time slot. The original click smoke script did not assert behavior and failed with its DOM dependency.

## Changes and impact

| Area | Change | Practical impact |
| --- | --- | --- |
| Query planning | Shared bounded clauses with intents, absolute dates, and dependencies | Chat and local answers handle the same compound requests; later questions are retained |
| Normalization | Recognize shorthand, joined code/day tokens, and Roman Hindi/Punjabi phrases; preserve M1/M2 and month/date spacing | Users can write short or imperfect requests without corrupting valid college identifiers |
| Dates and times | Shared ISO calendar resolver, India date input, weekday conflict checks, numeric/ordinal dates, past-tense kal, 24-hour validation | A date cannot silently become arithmetic or roll over into a different month |
| Timetables | Infer entity-plus-day schedules, scope official views by date, use view captions only for their actual field | Section, room, subject, and faculty schedules use the right data dimension |
| People | Fuzzy faculty timetable matching and verified roster resolution; ambiguous identities stay unresolved | A person's timetable cannot silently become the active user's timetable |
| Comparisons | Resolve faculty as well as cohort targets; preserve multiple entries at the same time | Parallel labs survive comparison; requested names and dates remain attached |
| Conversation | Short-lived references scoped to device profile, selection, and release | Follow-ups retain useful context while explicit new targets take priority |
| Rosters | Bounded scoped lists of public names and sections, with unavailable-branch handling | Useful cohort lists without exposing CRNs, registrations, or unrelated private fields |
| Academic facts | Remove obsolete hard-coded course credits and approximate first-year totals | Credits come from loaded courses; exact named-course sums are computed; enrollment is not guessed |
| Holidays | Enforce source-year coverage and distinguish absence from confirmed opening | A missing holiday entry does not falsely establish a working day |
| Sources | Update verified bootstrap to 1 September 2026, retain discovery/fallback, label historical limits | Old releases do not silently answer dates preceding the loaded release |
| Creator | Project metadata and a public creator response | Creator information is separate from administrative access |
| Verification | Assert actual chat form output; real Wrangler dry-run build; reusable live audit | Test success covers answers and bundle generation rather than console-only smoke output |

`legacyAnswerWithoutAi()` remains independent. Brain does not call an LLM, embeddings, or inference API. Input is limited to 1,200 characters and four clauses, with an explicit message when exceeded. User text is escaped before rendering. Offline-shell asset versions are updated for the changed scripts.

## Official source audit

Research date: 5 September 2026. Search snippets initially showed an older release; the live authoritative index and linked files were checked directly.

| Source | Evidence and appropriate use |
| --- | --- |
| [Applied Sciences timetable index](https://appsc.gndec.ac.in/time_tables) | Current effective release: 01-09-2026; linked FET files generated 8/31/26 10:28 PM. Use the complete validated release, not a guessed filename |
| Six linked timetable views | Live parsing verified 857 section, 988 subsection, 655 faculty, 617 room, 865 subject, and 863 programme rows. These are parser row counts, not student or unique-event counts |
| Seven current rosters linked by the index | All seven PDFs parsed successfully. These establish person, branch, section, and subsection; room occupancy is not a student roster |
| [Current first-year syllabus index](https://appsc.gndec.ac.in/node/27) | The applicable link is labelled batch 2024 onward. Do not substitute the archived 2018–2023 credit scheme |
| [Academic calendar archive](https://gndec.ac.in/?q=node/23) | July–December 2026 and January–June 2026 are separate academic spans; calendar revisions must be discovered and validated |
| [GNDEC 2026 holidays PDF](https://gndec.ac.in/sites/default/files/LoH26.pdf) | Authority for published 2026 gazetted/restricted holidays and half-day notices; not proof of every operating day or future year's holidays |
| [Faculty directory](https://gndec.ac.in/faculty/) | Public professional identity information; timetable assignments come from the timetable release |
| [Programme catalogue](https://academics.gndec.ac.in/programs/) | Programme scope; the live request returned an error during research, so no new programme facts were imported |

Run `node scripts/verify-compass-live.mjs` for the read-only live audit. It uses the Worker's discovery/validation and actual FET/PDF parsers, does not modify a deployed registry, and does not print student identifiers. Runtime questions and ordinary tests do not run this audit.

## Verification and limits

The automated suite includes 240 generated answer-level timetable variants in one matrix test, plus exact and fuzzy people, duplicate matches, date formats, year boundaries, invalid dates, unknown codes, source-year limits, profile changes, parallel-class comparisons, structured credit arithmetic, malformed input, and the actual chat submit handler. Existing parser, Brain, Worker, privacy, offline, and failure/fallback tests remain part of `npm test`.

Final verification: **211 tests passed, 0 failed**. Syntax checks passed. The production Wrangler dry run bundled the Worker and read all 21 public asset files. The live audit validated all six timetable views and seven current roster sources.

Use `npm run lint` for JavaScript syntax checks and `npm run build` for a genuine Worker/assets dry run. Neither deploys the application.

This is a deterministic campus-domain assistant, not unrestricted language understanding. More than four requests require splitting. Historical timetable releases, arbitrary date-range comparisons, unverified campus directions, current mutable regulations, and future holiday years may require an official source or clarification. The syllabus catalogue alone cannot prove a student's semester enrollment or total credits. Relative-date answers describe the loaded weekly pattern; date-specific notices can override it.

The in-app browser execution tool was unavailable. DOM integration was tested; visual mobile layout verification was not performed. No deployment was made.
