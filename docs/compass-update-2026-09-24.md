# Compass reliability and practical-exam update — 24 September 2026

## Project paths reviewed

The app is a static browser interface backed by a Cloudflare Worker. `public/app.js` owns the device profile, active timetable selection, FET parsing, chat dispatch, settings, source status and rendering. The Brain modules perform bounded local query planning and verification; `legacyAnswerWithoutAi()` remains independently available. The Worker discovers public GNDEC sources, maintains their registry in KV, proxies source files, and handles the separate optional AI/admin routes. The service worker caches the app shell, excluding `/api/` requests. Exam date sheets are separate from the recurring weekly timetable.

This update focuses on the supplied failure examples and new notices. It is not a claim that every feature has been redesigned or that a language model has been trained. The existing admin authentication model, external AI configuration, profile storage and timetable facts are unchanged.

## Mobile update failure

The screenshot shows JSON parsing failing on a document beginning with `<!doctype`. Read-only production HTTP probes reproduced the following on `/api/sources`:

| Request | Production response before this change |
| --- | --- |
| `Sec-Fetch-Mode: cors` | 200, JSON registry |
| No fetch-metadata header | 200, JSON registry |
| `Sec-Fetch-Mode: navigate` | 200, app HTML |

This reproduces an HTML-for-JSON failure mechanism, but does not establish which headers the unidentified phone/browser sent. Cloudflare documents this SPA navigation behaviour and recommends explicit API routing: [SPA routing documentation](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/#advanced-routing-control).

`wrangler.jsonc` now routes `/api/*` to the Worker first. Unknown API paths return JSON 404 instead of the app shell. The browser requests JSON without caching, validates the registry before replacing state, and retries an HTML/malformed response once at a fresh URL. Failure leaves the existing data intact and displays recovery guidance instead of a JSON parser exception.

Local Wrangler HTTP checks confirmed JSON responses with both absent and navigation fetch metadata, a JSON 404 for unknown APIs, the unchanged homepage, and a working supplied-notice page. This does not constitute testing on the friend's physical phone.

## Deterministic answers and interface

- Course-unit/syllabus details no longer become faculty searches merely because the question includes “details” or “information”. Actual faculty queries retain their route.
- Spaced room codes such as `F 108 timetable` use the complete official room view. Personal class queries keep the selected timetable scope.
- Chat bubbles retain their original India date/time across reloads. Older messages without timestamps say the date was not recorded. A saved answer to “today” is historical, not recomputed when the tab opens.
- Supplied exam references remain accessible even if live source discovery fails. Restored chat preserves the specifically allowed local exam-source links.
- App and service-worker cache revisions advance without changing profile or timetable storage keys.

## Supplied practical notices

`public/practical-exams.js` contains a small immutable deterministic dataset and resolver, used before theory-exam routing in all Brain modes and the legacy path. It records the signed Applied Sciences notice dated 18 September, the accompanying Physics/Chemistry/English lab message, and all nine workshop section rows.

The lab window is **5–9 October 2026**, in respective lab turns. The signed notice postpones a holiday sitting to the corresponding weekday of the following week. No exact personal lab time is invented from the weekly timetable.

Workshop times were confirmed by the supplying user on 24 September:

| Section (both subsections) | Date | IST time |
| --- | --- | --- |
| MEB | 7 October | 10:30 AM–12:30 PM |
| MEA, RAI | 8 October | 8:30–10:30 AM |
| CEB, ECA | 8 October | 2:30–4:30 PM |
| CEA | 9 October | 10:30 AM–12:30 PM |
| EEA, ECB | 9 October | 12:30–2:30 PM |
| EEB | 9 October | 2:30–4:30 PM |

The three original handwritten AM end labels are retained alongside user-confirmed corrections. ECE-A/B in the photograph maps to ECA/ECB. The workshop sheet has no visible issue date. These sources are labelled user supplied, not independently verified official web publications. The transcript page is generated with `node scripts/build-practical-notice.mjs`; it does not pretend to be an original photograph.

Examples: `my practical exams`, `my workshop MSE1`, `ECE B2 workshop exam`, `all workshop exams`, `Physics lab MSE1`, `English lab exam`. Explicit sections do not change the active device profile. Unsupported sections/sessions fail safely. Theory exams continue to use their original supplied PDF.

## Verification and scope

Regression coverage includes all nine confirmed workshop rows, source corrections, section switching, unsupported requests, India midnight, real chat-form routing, JSON/HTML retry and preservation, unknown API paths, restored timestamps, and offline reference rendering. Existing tests that compare message text now exclude the added timestamp/control elements.

One pre-existing roster test expected an offline exact lookup to expose cached personal details, while the original resolver requires a live PDF recheck and returns an error offline. The original behaviour was reproduced from `HEAD`; its safeguard is preserved, and the test expectation now matches it.

Validation: `npm test` — 288 passed, 0 failed; `npm run lint`, `npm run build` (Cloudflare dry run), and `git diff --check` passed. No production deployment, Git push, secret change or Cloudflare-account configuration change is performed by this update. Publish with `npm run deploy` when ready, then reload the app and retry the affected phone.
