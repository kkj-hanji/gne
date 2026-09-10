# Timetable loading incident — 10 September 2026

The public Worker returned valid GNDEC timetable HTML with HTTP 200, but the deployed browser parser returned zero entries. The new official export uses FET 7.10.4, generated on 10 September at 1:54 PM; its low-detail HTML omits the semantic `.subject`, `.teacher`, `.room`, and `.activitytag` markers used by the previous export. The effective timetable date remains 7 September.

Evidence collected from the live service:

- `/api/sources` discovered the new `06_09_2026 ON WEBSITE_*_days_horizontal.html` files and reported their new hashes/footer.
- `/api/timetable?source=groups` matched the official upstream file byte for byte. Cloudflare was delivering the source successfully.
- The deployed `app.js` matched the clean local Git checkout, ignoring line endings.
- `wrangler deployments list` showed the last deployment on 7 September at 17:09 UTC, with no deployment on 10 September. This investigation did not change Worker settings, cron, KV, or profiles.
- Source discovery checked recognizable FET tables but did not run the browser's field parser. The older fallback only handled upstream HTTP failures; an unreadable HTTP-200 export reached the browser unchanged.

Official sources: [current index](https://appsc.gndec.ac.in/time_tables), [new section HTML](https://appsc.gndec.ac.in/sites/default/files/2026-09/06_09_2026%20ON%20WEBSITE_groups_days_horizontal.html), [previous section HTML](https://appsc.gndec.ac.in/sites/default/files/2026-09/06_09_2026_groups_days_horizontal.html).

## Changes

`public/app.js` now supports both semantic and low-detail FET HTML. It preserves concurrent activity columns, rowspans, explicit empty fields, optional activity tags, co-teachers, and the distinct field order for all six views. Names and rooms come from source fields; ambiguous single fields remain unreadable rather than being assigned to the wrong type.

Imports and individual timetable views reject partially parsed sources. Refresh validates both section and subsection files before changing saved state. If current files fail HTTP, parsing, or release-consistency checks, both previous-release files are requested together and labeled as fallback. If both attempts fail, saved data remains unchanged.

`public/index.html` and `public/sw.js` use app/cache revision `20260910-1`. The existing user timetable/profile storage keys are unchanged.

## Verification

The new parser recovered the following counts, with zero unparsed activity cells:

| View | Entries |
| --- | ---: |
| Sections | 857 |
| Subsections | 988 |
| Faculty | 655 |
| Rooms | 617 |
| Subjects | 865 |
| Programmes | 863 |

All 4,845 parsed entries matched the previous official exports by group, day, start/end time, subject, teacher, room, activity type, and cohort. No timetable facts changed in this comparison.

`test/fet-low-detail.test.mjs` covers new markup, simultaneous classes, all six view layouts, missing fields, optional tags, rowspans, malformed/partial exports, HTTP-200 parse failures, paired fallback, and preservation of existing state. Existing parser, Brain, chat form, Worker, roster, privacy, and syllabus regressions also passed.

Results: `npm test` — 222 passed, 0 failed; `npm run lint` — passed; `npm run build` — passed (Cloudflare dry run); `git diff --check` — passed.

The fix is prepared in the workspace. This report does not claim a production deployment or physical Android/browser testing. Formats with new, unrecognized field layouts will use the safe failure/fallback path until supported.
