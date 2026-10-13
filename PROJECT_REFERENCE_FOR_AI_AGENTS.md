# GNDEC Compass — Project Reference for AI Agents

**Purpose:** a detailed, code-oriented handoff for an AI agent that may copy this project, add it to a larger project, integrate selected components, or build a separate product with similar behavior.

**Project checked:** 13 October 2026. **Repository snapshot:** `f798237` (`chore: sync project changes 2026-10-10 23:04`). Treat this as a description of the checked-in implementation at that revision, not a guarantee that a live site, upstream GNDEC source, Cloudflare secret, KV publication, or later deployment still has the same state.

## 1. What the project is

GNDEC Compass is an installable, responsive website for students of Guru Nanak Dev Engineering College (GNDEC). It combines a personal timetable and profile, read-only student and faculty lookup, a chat-style question box, syllabus and calendar answers, notices and exam helpers, and a Cloudflare Worker that fetches and validates changing college sources.

“Personal” means personal to the browser on the current device. A visitor selects a group/subsection or applies a roster-matched profile. Compass uses that active selection for timetable answers. Another visitor using another browser has a separate local profile. There is no conventional student login, cross-device account, or cloud-synced conversation in the implementation.

The question box is **not a single AI bot**. It first handles many questions with local rules and structured college data. Its deterministic Brain engines do not call an LLM. Only eligible open-ended study/help questions may be sent to the separately configured Cloudflare Worker AI proxy. The project is designed to retain a useful local answer and its independent legacy fallback if a model is disabled, unsuitable, unavailable, or returns an unsafe result.

## 2. Where it is hosted and how to run it

| Item | Repository evidence |
|---|---|
| Public site URL configured in page metadata | `https://gndec-compass.koush3069.workers.dev/` |
| Cloudflare Worker name | `gndec-compass`, from `wrangler.jsonc` |
| Worker entry point | `src/worker.js` |
| Static web root | `public/`, served through the Worker `ASSETS` binding |
| Shared state binding | Cloudflare KV namespace binding called `SOURCE_REGISTRY` |
| Configured scheduled trigger | `17 */4 * * *` (minute 17, every four hours) |
| Source-code remote in this checkout | `https://github.com/kkj-hanji/gne.git` |

These values identify the intended/configured deployment. They do not establish live uptime, the deployed commit, the active KV records, or the values/configuration of production secrets. The production URL was not independently confirmed while preparing this document. The repository calls the product GNDEC Compass; do not represent it as an official GNDEC-operated service unless the owner supplies evidence of that relationship.

The stack is plain HTML, CSS, JavaScript ES modules/scripts, Node.js tooling, and Cloudflare Workers. The browser code is primarily dependency-free. The package includes `pdfjs-dist` for local PDF reading and `linkedom` for DOM-based tests. Worker configuration requires the secrets `MY_NVIDIA_API_KEY` and `ADMIN_API_TOKEN`; never copy real secret values into a handoff, prompt, source file, client bundle, or another project's Git history.

Development on Windows:

```powershell
npm install
npm run dev
```

This repository's current `dev` script starts Wrangler on port `3000` and listens on `0.0.0.0`; open the local URL Wrangler prints. The README has older references to port `8787`, so the current `package.json` script is the better source for the port. Deployment uses `npm run deploy`. `npm run build` performs Wrangler's deploy dry run. `npm test` runs the Node test suite; `npm run lint` checks JavaScript syntax.

## 3. Main user-facing features

### Today

- Shows the active device's college day, current/next class information, day schedule, timetable status, and relevant notices.
- Uses local time calculations set to the India time zone for college-day behavior.
- Can switch between the regular schedule and a supported exam view according to the device's `Today page` setting.
- Shows verified or explicitly user-supplied source information where available.
- Offers shortcuts into the question box for relevant notices and schedule questions.

### Ask Compass

- A chat-style form for questions about the active timetable, dates, courses, rooms, profile, people, notices, and general supported campus questions.
- Quick-start question buttons, ranked local suggestions as the user types, contextual follow-up buttons, a copy-answer action, stored local chat history, and **Clear chat**.
- Accepts English, Hindi, Punjabi, Romanized Punjabi/Hindi, Hinglish, common aliases, and bounded typo variants. Language coverage is finite and question-dependent; it does not amount to general natural-language understanding for every query.
- Factual campus answers use local engines and verified/supplied data. Some requests also load the needed official source through the Worker, so “no model inference” does not mean “no network access.”
- Open-ended study help can use the separately configured external AI path when allowed. User identity/profile information is deliberately left out of that request.
- Some diagnostic model controls/badges are hidden and belong to the enrolled admin view; they are not the regular student chat experience.

### Timetable

- Displays GNDEC FET timetable data as weekly, daily, or list/agenda views, with optional compact spacing or swapped grid axes.
- Supports group/section and subgroup/subsection selection, parallel practicals, class details, source/revision information, and timetable refresh.
- Can import a supported timetable HTML file locally through Profile. Timetable factual answers are tied to loaded schedule rows and the active selection.
- Exposes official section, subgroup, teacher, room, subject, and programme timetable views when the corresponding official view is loaded. An official view has its own coverage; a missing view must not be replaced by an unrelated personal timetable.

### Profile and local setup

- Starts neutrally rather than assuming every visitor is a specific student.
- Provides manual timetable group/subgroup selection and a current roster lookup using student name, exact identifier, or serial where supported.
- Lets a student review or apply a verified match. Applying a roster profile updates this device's active timetable selection.
- Displays facts found in the matching profile and may reconcile roster updates by a stable CRN or registration number. Earlier serial numbers can be retained as local history if a verified matched profile changes serial.
- Supports roster search/history, a selected roster student's facts, saved timetable, data source status, and official links.
- Student searches initiated in chat are read-only. They do not change the current device's selected profile.

### Settings

- Provides theme accents, Today-page mode, timetable layouts and display options, motion/accessibility preferences, attendance and holiday-alert options, language/display preferences, and a conversation-memory reset.
- Includes timetable update details and source-refresh workflows.
- Contains exam-publication controls visible only under the implemented admin conditions.
- Some settings are display preferences or calculator thresholds, not live college data and not proof of actual attendance, academic standing, identity, or access rights.

### Installed/offline use

- `public/manifest.webmanifest` configures GNDEC Compass as an installable PWA with standalone display, flexible orientation, an icon, and Ask Compass/timetable shortcuts.
- `public/sw.js` caches the application shell and selected offline/static resources, serves a cached shell on navigation failure, and removes previous prefixed shell caches when a new cache activates.
- Offline availability means previously cached app/data may continue to work. It does not promise that a first visit, new official source, faculty profile, photo, live exam publication, or external AI works offline.

## 4. Chat examples and capability boundaries

Examples below describe intended query families. The active profile, loaded data, date range, current sources, and exact phrasing affect whether a particular query can be answered.

### Personal classes and timetable

```text
What is my next class?
What is my second class tomorrow?
What classes do I have tomorrow?
Show my timetable on 20 October.
Where is Physics?
Who teaches Math?
When is my next Physics class?
What do I have before 12 PM on Friday?
What time do I finish today?
How long is my break tomorrow?
How many classes do I have this week?
Which day is lightest?
What building do I use most this week?
Do I have Physics on Tuesday?
What class is after Maths?
Physics kahan hai?
Aaj ka timetable batao.
Kal ka timetable dikhao.
Parson meri kaunsi class hai?
```

Compass can calculate from the active weekly schedule and bounded date plans. A weekly timetable is not proof that a special dated class occurred or that an individual attended. Answers should expose when a date is represented only by a recurring weekly pattern or when a release does not cover a requested historical date.

### Official timetable views and comparisons

```text
Show the room timetable for G6.
Show the faculty timetable for [faculty name].
What classes are scheduled in A9?
List my teachers and the subjects they teach.
List the classes in my subsection.
Compare ECB and ECB2.
Which Physics classes differ between ECB and ECB2 on Tuesday?
List all section timetables.
Compare Monday in the current and previous timetable releases.
```

The view/section named by the user must resolve against an official loaded view or verifiable selection. Comparison memory stores its source scope/revision, can ask for clarification, and should be invalidated when that underlying data changes.

### Student and profile questions

```text
Who is my mentor?
What is my section and subsection?
What is my mentoring group?
Find student [name] in [section].
Find student with CRN [exact CRN].
Students in ECB1.
How many students are in ECB?
Show my profile.
What was my previous serial number?
```

Scope matters. Exact identifier lookup and a public, section-scoped roster listing are different requests. Bounded section/subsection list results expose only names and sections, with at most the first 20 names. Lookup/search results follow the applicable identity/privacy flow. A bare name must not be assumed to identify a student; duplicate matches require safe disambiguation. Do not print real roster records or identifiers in an agent prompt, sample, fixture, or public reference document.

### Teacher and campus schedule questions

```text
Who teaches [course]?
What does [teacher] teach?
Where does [teacher] teach on Thursday?
Show the teacher timetable for [teacher].
Show the subject timetable for [subject].
Is room G6 occupied at 2 PM on Monday?
Which rooms are free at 11:30 AM on Tuesday?
```

Teacher, subject, and room answers should be based on the right public timetable view or matching rows, not a name guess. Room vacancy is calculated only for one validated day/time against loaded published room rows; “free now” must not be invented if the date/time or current room-view coverage cannot be established. Campus questions do not grant route-finding data: exact building/floor directions are not in the timetable merely because it lists a room code.

### Syllabus, grades, and calculations

```text
Physics syllabus.
Math units.
PPS course outcomes.
What are the Physics assessment marks?
How many credits are in [verified course code]?
25% of 240.
Solve 2x + 3 = 11.
What grade average gives an SGPA target of 8?
What is my attendance percentage if I attended 42 out of 50 classes?
How many classes can I miss and keep a 76% target?
8.4 CGPA to percentage.
```

Syllabus output depends on the loaded/indexed syllabus record. Course credits and marks should be used only when explicitly present for that course. Numeric arithmetic, supported word numbers, bounded equations, and configured CGPA conversion are local calculations; they cannot tell the student what grade they actually earned. Attendance answers calculate from numbers the user enters and a chosen target; Compass does not import an attendance register.

### Dates, holidays, academic calendar, and exams

```text
What date is day after tomorrow?
What is the date on Tuesday next week?
Is 12 August a GNDEC holiday?
How many days from 5 October to 12 October?
When does first-year semester teaching start?
When do end-semester exams begin?
What is the exam date sheet for my section?
What exam is listed for my section on [date]?
What is the workshop schedule for ECB?
What is my confirmed exam room for this exam?
```

Temporal resolution uses Asia/Kolkata in the app. Date calculations and official holiday/academic-calendar coverage have explicit year/range boundaries. The bundled academic-period snapshot covers July–December 2026; it does not supply every individual paper date. The current checked-in exam seed has **9 workshop events and 0 seating assignments**. Do not repeat older descriptions of archived theory seating/PDF data as if those seats are present in the current deployed publication. A missing event/seat is not proof that college is closed or that no unlisted exam exists. Source/provenance and publication freshness must be checked.

### Other supported college questions

The local knowledge patterns also include selected questions about official branch/program catalogues, college duration/timings, notices, fee pages, library links, scholarships, transport, hostels, departments, administration contacts, campus information, clubs, labs, placements, first-day/fresher topics, and general study or time-management suggestions. Many of these are **bounded pointers, general advice, or “not verified” answers**, not rich structured live datasets. For mutable fees, hostel rules, transport routes, placements/statistics, leadership appointments, club events, rooms/building directions, and office hours, use the linked official current source rather than quoting an old cached fact.

## 5. Non-AI chat architecture and layers

“Non-AI” in this section means no LLM or inference endpoint is used to produce the answer. The answer may still depend on a fresh official-source fetch; fixed language rules, fuzzy matching, arithmetic, parsers, and date operations are deterministic software.

```text
Question form / quick action
        │
        ├── validate, plan, split up to 4 clauses, resolve temporal scope
        │
        ├── application-owned factual adapters
        │     exams · workshops · calendar · room availability
        │     timetable analysis · schedule views · roster list · profiles
        │     syllabus · faculty directory / academic contacts
        │
        ├── deterministic Brain chain (default)
        │     Brain 2.2  →  Brain 1.2  →  Brain 2
        │
        ├── independent legacyAnswerWithoutAi() fallback
        │
        └── if still eligible and the selected mode allows it:
              structured/sanitized context → /api/chat → configured model
```

Each layer can decline. A result is not accepted just because code produced a string: the application checks handled/verified status, confidence, response shape/size, plan bounds, unsafe HTML patterns, and engine validation. A failure should continue through the deterministic chain/legacy fallback or a safe clarification. Do not merge the legacy fallback into the LLM route or remove it during a port.

| Layer | Code | Role |
|---|---|---|
| Shared Brain kernel 1.0.0 | `public/brain-kernel.js` | Normalization and language helpers, intent/query/date planning, bounded conversation context, result contracts, safe arithmetic/linear equations, calendar/holiday helpers, roster and schedule helpers. |
| Brain 2.2.0 | `public/brain-v2-2.js` | Timetable comparisons, ambiguity/clarification, comparison follow-ups and revision/scope-aware memory. |
| Brain 1.2.0 | `public/brain-v1-2.js` | Privacy-gated student/faculty search, scoped public roster functions, faculty timetable intent, arithmetic, attendance/grade calculations, holidays, academic scope and college-information patterns. |
| Brain 2.13.0 | `public/brain-v2.js` | The broad deterministic schedule, conversational context, query interpretation, course/teacher/room reasoning, student/faculty and syllabus intent handlers. “V2” is a historical filename; its checked-in version is 2.13.0. |
| App routing and verification | `public/app.js` | Builds context from current selection and loaded local/source data; runs factual adapters; orders and validates engine results; stores/clears conversation memory; calls independent legacy fallback. |
| Legacy fallback | `legacyAnswerWithoutAi()` in `public/app.js` | Separate local answer path for fallback, compatibility and explicit testing. Preserve its independence and continued operation. |
| Structured domain modules | `public/*` exam, calendar, timetable and room files | Focused parsers, validators and answer computations invoked by the app; most are dependency-free IIFEs attached to `globalThis.Compass…`. |

### Important interpretation rules

- Active `section` and `subsection` come from this device's validated selection/profile. Never silently change the profile in order to answer chat.
- Student search in chat is read-only. Respect exact identifier, duplicate-name and section-scope protections. Scoped list results are capped and omit identifiers.
- A subject question should use the syllabus when it asks about units/marks/credits and the timetable when it asks about the next class/time/room/teacher. Do not let a similarity match substitute one kind of evidence for the other.
- A loaded timetable is a weekly pattern; only a dated verified notice establishes an exam or exception. Label the pattern where special-date coverage is missing.
- On a room-availability question, require a usable day/time and a relevant loaded room view. Unknown rooms, missing coverage and invalid/range requests produce an honest decline.
- Do not treat the app's generative-looking response text or internal confidence as evidence. The source row/document is the evidence.
- User memory is bounded and tied to context/revision. Clear it when the profile, subgroup, source revision, or explicit user action requires it.

## 6. Optional external AI: exact boundary

The external path is an optional separate feature, not one of the deterministic Brain layers. It is reached from the app's chat flow only after the local/structured routes do not handle the question and the current mode permits it. The Worker posts to NVIDIA's compatible chat-completions endpoint using a server-side `MY_NVIDIA_API_KEY`.

- Worker default model order is `meta/muse-glimmer-30b`, then `openai/gpt-oss-120b`. Heavy requests reverse the order. A requested model is accepted only for an enrolled/unlimited admin device. Nemotron is deliberately not in the Worker route.
- The app constructs a bounded context from the active timetable and relevant catalogues, selected official syllabus facts, and resolved public faculty details. A timetable or course in this context is still the authority for those facts.
- The request must have a non-empty question (maximum **1,200 characters**) and context of at most **36,000 serialized characters**.
- The worker redacts student identifiers from the prompt and sanitizes context before inference. Profile identifiers and mentor details are not intended to leave the device for inference. Avoid weakening or bypassing that boundary.
- Standard requests are limited by a per-day hashed device/network counter. The default is **8** per day; `AI_REQUESTS_PER_DAY` can be configured from 1 to 100. Local timetable/Brain answers are not counted as model requests.
- Streaming is supported; if a model fails before emitting text, the Worker can try the next configured model. After text has begun, it cannot safely replace the answer with a different model's response.
- The server secrets are not in frontend code. A missing key disables external inference while leaving local chat available.
- General study advice may use the external model. It must be identified as general advice and must not be framed as an official timetable, policy, grade, appointment, exam or course fact.

The Worker also contains a personal-device Kaushik enrollment convenience flow. `KKJ` plus a matching profile/device/network can reveal owner-only UI and has a 30-day hashed device/network record. This is not normal user authentication; user-editable profile values are not a trusted identity system. Admin source maintenance is separately gated by `ADMIN_API_TOKEN`. Do not copy this owner shortcut into another product without an explicit requirement and replacement identity/security design.

## 7. Data currently in the repository

Counts below are from the checked-in files, not a live API response. Several are dated snapshots and can be stale. For current usage, follow the Worker source registry and the `generatedAt`/`checkedAt`/revision/provenance fields rather than treating these counts as timeless facts.

| File or source | What it contains | Checked-in snapshot/evidence | How Compass uses it |
|---|---|---|---|
| GNDEC FET time-tables index at `https://appsc.gndec.ac.in/time_tables` | Source page links for group, subgroup, teacher, room, subject, year/programme schedules and student section PDFs. | Worker discovers links; registry records verification/content hashes/source version. Bootstrap and old in-repo HTML are fallbacks. | Worker verifies the links, fetches the selected HTML; browser parses FET rows into entries with day, start/end, subject, teacher, room, group/subgroup/cohort and activity type when present. |
| Current branch section PDFs, through `/api/section-list` | Public roster for CE, CS, EC, EE, IT, ME and RAI. | Bundled roster index schema 4 has **1,146 records** and 7 source entries; `generatedAt` is **2026-09-18**. That is a snapshot, not the live roster. | Browser can fetch current branch PDFs and parse them locally; it can cache a bounded/versioned index on this device for lookups and scoped counts/lists. |
| Archived temporary-section PDFs | Earlier registration/serial information for branches when available. | Worker retains verified source links in registry; records are reconciled with current profiles only by stable CRN/registration identity. | Supports saved history lookup. Historical serial is not a safe universal student identity. |
| GNDEC public faculty directory, `https://gndec.ac.in/faculty/` | Public names, designations, departments, public links and professional profile fields/photos when source provides them. | Bundled directory index has **272 records**, checked/generated **2026-09-18**. `public/data/faculty-contacts.json` has **34 people and 20 roles**, checked **2026-09-18**. | Fuzzy/explicit search and official faculty/profile/timetable linking. Browser caches a directory locally for a limited period; Worker may fetch/enrich a particular public profile/photo. Do not treat a checked-in index as guaranteed current. |
| First-year study-scheme PDF/index | Syllabus, course codes, units/topics, outcomes, credits, assessment fields and references present in the source. | `public/data/first-year-syllabus-index.json` has **33 pages**, generated **2026-08-13**; fallback PDF is referenced in `src/worker.js`. | Searchable index allows deterministic page/course/unit answers. Data availability differs by field/course; unknown fields must be declined. |
| Academic calendar | Semester/academic periods for defined programmes and dates, distinct from individual subject exam schedules. | `public/academic-calendar.js` is a July–December 2026 snapshot (issued 2026-07-28; marked checked 2026-09-15 in code). | Returns academic period boundaries and a current official link. Does not make up MSE dates, a subject-by-subject final-exam timetable, or unpublished vacation dates. |
| Holiday calendar | 2026 GNDEC holiday entries with dates/types and Hindi/Punjabi labels where included. | Constants in `public/brain-kernel.js` refer to official 2026 holiday-source URLs. | Local 2026 date/month queries and half-day vs full-closure distinctions. Other years or changed notices need the current official page. |
| Date sheet and workshop/practical sources | Separate exam events, their kinds, sections, dates, times, reporting times, source notes, and seat assignments when published. | **Current seed:** `public/data/exam-summary.json`, revision `seed-20261004-workshops-1`, published **2026-10-04**, has **9 events**, all workshop rows, and **0 seat assignments**. The current seed does not contain the old archived seat tables. The MSE-I date-sheet module identifies a user-supplied 2026-09-14 PDF and has no official URL for that supplied sheet. Workshop content is also labelled from a user-supplied photo; official web publication was not verified. | Domain validates and filters by section/course/date. Exact seating requires an assignment in the current verified publication; absent assignment means “no confirmed seat,” never a guessed seat. Source provenance must travel with the answer. |
| General notices | `public/data/notices.json` is a list of GNDEC notice titles, dates and links. | 10 items in a checked-in snapshot; not a live event feed. | Supporting reference/link data only where wired into a view. Confirm current notices at the official source. |
| College event/timetable/faculty bundle JSON | `public/data/college-events.json`, `timetables.json`, `faculty.json`, and `notices.json` are bundle files. | Some files are empty or contain no active rows in this snapshot. Presence in the repository does not prove Compass loads them or uses them to answer. | Do not tell a user an event/timetable/faculty record exists without tracing it through actual loader and validation. Live FET sources and faculty indexes have distinct paths. |
| Knowledge graph | `public/data/knowledge-graph.json` links to official timetable, holiday/calendar, department, campus and library sources and includes cautious high-level descriptions. | Version `2026.09.03`, marked verified **2026-09-03**. | Reference/supporting link catalogue; it explicitly says mutable facts should be fetched from a current official page or treated unavailable. |
| Parsed/local profile, schedule and conversation | Active student's selected profile, parsed timetable/cache, settings, conversation memory, recent searches, source metadata. | Stored in browser `localStorage`, not the checked-in source registry. | Personal answers and offline reuse on that browser. It is not a cross-user cloud profile or identity provider. |
| Cloudflare KV `SOURCE_REGISTRY` | Current/previous validated public source registry; expiring hashed AI request counters; admin AI enrollment hashes; current/previous exam-publication records. | Production value is external to this repository and was not inspected for this handoff. | Source registry serves links and revisions; exam API serves student-safe summary and a seat only for an exact CRN/event query. No full roster/profile is intended to be copied into KV. |

### Avoid stale or misleading data claims

- Do not state the repo's bundled counts or `checkedAt` values are live counts. Ask `/api/sources` or fetch the relevant current GNDEC official page and check its verification/revision.
- Older `README.md`, `docs/compass-brain.md`, `docs/exam-publishing.md`, feature plans, or update reports can describe earlier behavior. For disputed feature behavior, current source code/tests and current seed take precedence; update stale prose when discovered.
- In particular, the older Brain guide says roster enumeration fails closed. The current app supports **bounded, section/subsection-scoped public name lists and counts** in its documented privacy scope. It does not follow that arbitrary full-roster extraction or identifier disclosure is allowed.
- The older exam guide describes 2,292 historic seat assignments and supplied September seating. The current checked-in seed has **zero** seat assignments. Treat an active Cloudflare publication as unknown until `/api/exams` returns it.
- `public/data/exam-summary.json` and `src/data/exam-seed.json` are derived seeds that currently record 9 workshops/0 seats. Do not present example local `sourceUrl` prose as proof that an event is an official publication.
- Some UI text and old specification files advertise admin dashboard ideas or features. A mock statistic, design note, test fixture, roadmap item or unimplemented API response is not a functioning production capability.

## 8. Data flow and API map

The browser calls the same-origin Worker; the Worker validates source URLs against official GNDEC hosts, checks source content before updating the registry, and returns its retained verified registry if discovery fails. The scheduled cron is a source-discovery job, not a job that makes student profiles or answers. The Worker assets binding serves the `public` site, while `/api/*` routes run through `src/worker.js` and the exam subrouter.

| Route | Method / purpose | Privacy / use |
|---|---|---|
| `/api/sources` | `GET`; public source registry and versions. Optional `?refresh=1` attempts a current source discovery. | Public URLs, verification metadata, content hashes and labels; no raw student profile. |
| `/api/timetable?source=groups` | `GET`; source can be `groups`, `subgroups`, `teachers`, `rooms`, `subjects` or `years`. | Proxies selected verified GNDEC FET HTML with edge caching. |
| `/api/section-list?branch=EC` | `GET`; current public branch PDF. Optional `history=` requests a verified historical source. | PDF is parsed in browser; proxy is not an inference request. |
| `/api/syllabus` | `GET`; validated/current first-year syllabus PDF. | Browser parses/searches relevant syllabus. |
| `/api/faculty` | `GET`; official faculty directory. | Public directory data. |
| `/api/faculty/profile?id=…` | `GET`; enrich one public faculty profile. | Only a resolved public staff identifier; not a student identifier. |
| `/api/faculty/photo?id=…` | `GET`; bounded official faculty photo proxy. | Public faculty images only. |
| `/api/exams` | `GET`; current publication summary/events. | Deliberately omits full seat assignment array. |
| `/api/exams/seat` | `POST`; asks for an exact CRN and event ID to find a seat. | Sends one exact identifier to the same-origin Worker; it does not send it to inference. No match is not a confirmed seat. |
| `/api/admin/exams` | Authorized `GET`/`PUT`; load or publish validated exam publication. | Uses the publishing/admin authorization path. A reviewed revision is required; previous publication/rollback behavior lives in `src/exam-store.js`. |
| `/api/chat` | `POST`; optional external AI, bounded question/context, optional token stream. | Requires server key; applies redaction and daily rate limit. Local Brain answers do not call this route. |
| `/api/admin/sources/refresh` | Authorized `POST`; manually run source discovery. | Requires `ADMIN_API_TOKEN`. |
| `/api/admin/sources/override` | Authorized `POST`; supply a complete candidate source set for validation. | Requires `ADMIN_API_TOKEN`; it does not accept arbitrary unverified source URLs. |
| `/api/admin/ai/unlock` | `POST`; enroll eligible owner device/network for admin AI. | Profile convenience check, hashes in KV, expiry; not general sign-in. |
| `/api/admin/ai/holidays-fetch` | Authorized `POST`; implemented holiday-page fetch route. | Requires server-side admin authorization. Check the result's actual evidence; a page fetch is not automatic policy verification. |
| `/api/admin/ai/roster-qa`, `/syllabus-gaps`, `/notice-summarizer`, `/alias-builder`, `/query-log-analyzer`, `/translation-assistant`, `/debug-replay` | Routes intentionally return HTTP **501** when reached as authorized admin operations. | They are explicitly unimplemented. Do not advertise their names in the UI as working operations. |

Administrative token header accepted by the Worker: `X-Compass-Admin-Key` or `Authorization: Bearer …`. Never embed this credential in client JavaScript. The owner convenience `KKJ` flow is a separate mechanism from this maintenance token.

## 9. Storage and privacy summary

| Information | Where it belongs | Important boundary |
|---|---|---|
| Selected student, CRN/registration/serial, group/subsection, mentor fields | Browser local profile/cache. | Do not send to the open-ended AI endpoint; do not silently switch this selection in chat. |
| Current roster/PDF and recent student search | Public official source; parsed and optionally cached on the user's browser. | A public source is personal data in context. Keep lookups scoped, bounded and read-only; do not place records in prompts, logs, or new public snapshots. |
| Chat message history and local Brain context | `localStorage` for this device. | Bounded history/context; clearing chat removes the relevant memory. No account-level transcript sync is implemented. |
| Timetable and revisions | Official FET URLs proxied through Worker and selected/cached on device; source metadata in KV. | A row states a scheduled course, not actual attendance or an individual guarantee. Profile selection scopes personal answers. |
| AI daily counters/source registry/exam publication | Cloudflare KV. | AI limiter/admin device keys use hashes. Exam publication can contain CRN seats; summary omits seats and individual query asks one CRN/event. |
| Server keys | Cloudflare Worker secrets / local untracked `.dev.vars` as appropriate. | Never put them in `public/`, a checked-in `.env`, logs, screenshots, handoff text or cloned frontend code. |

`localStorage` is device-local storage, not a secure vault: someone using that browser can inspect or modify it. A public roster or profile field does not prove authenticated identity. Sensitive roles need verified sign-in or an appropriate access-control layer before use. Do not tell another project agent that the current profile shortcut supplies strong authentication.

## 10. Repository map

| Path | What another agent should look for |
|---|---|
| `public/index.html` | Page structure, forms, accessible controls, quick prompts, bundled script and cache-version references. |
| `public/styles.css` | Responsive pages, themes, timetable and chat layouts, accessibility/contrast and print rules. |
| `public/app.js` | State/profile/timetable persistence, data loaders, FET/roster/faculty parsers, local suggestion and answer routing, result validation, legacy fallback, UI events. The file is large; use `rg -n "function name"` before editing. |
| `public/brain-kernel.js` | Shared pure/mostly pure deterministic primitives, limits, language/calendar/holiday, planning and validation contracts. |
| `public/brain-v2-2.js`, `public/brain-v1-2.js`, `public/brain-v2.js` | Ordered independent deterministic engines and their validators/suggestions. Respect their versioned interfaces. |
| `public/schedule-analysis.js`, `public/room-availability.js` | Bounded date aggregation/ranking/comparison and room occupancy computations. These modules accept rows; they do not independently fetch a trusted source. |
| `public/exam-domain.js`, `public/exam-desk.js`, `public/exam-store.js` | Exam publication validation, browser experience/answer integration, and Worker/KV publication and seat lookup. |
| `public/exam-schedule.js`, `public/practical-exams.js`, `public/academic-calendar.js` | Separate bundled date-sheet, workshop/practical, and academic-period domain data. Preserve source/provenance distinctions. |
| `public/date-sheet-import.js`, `public/exam-import.js`, `public/admin-exams.js` | On-device document reading, PDF/date/seating import and owner-facing publication workflow. Import preview/review is distinct from publication. |
| `public/data/student-roster-index.json`, `faculty-directory-index.json`, `faculty-contacts.json`, `first-year-syllabus-index.json` | Generated public-source indexes/snapshots, with generation/verification time. Do not paste the record content into AI instructions. |
| `public/data/exam-summary.json`, `src/data/exam-seed.json` | Checked-in exam-summary/seed fallback; inspect exact revision before describing the current seat/event contents. |
| `public/sw.js`, cache query versions in `public/index.html` | Offline shell and client asset versioning. When shipped app JS or CSS changes, update its URL version and worker shell/cache version consistently. |
| `src/worker.js`, `wrangler.jsonc` | Worker API, public source validation/proxies, optional AI model path, admin auth, KV binding, static asset serving and cron. |
| `scripts/build-directory-indexes.mjs`, `build-syllabus-index.mjs`, `build-exam-seed.mjs` and related `scripts/` | Reproducible indexes/seeds and local investigative tools. Review script inputs/output before regenerating large data files. |
| `test/` | Node regression tests for domain parsers, routing, privacy, schedule calculations, worker routes and real form interactions. |
| `docs/` | Feature-specific and time-stamped implementation reports; useful history, but compare with current implementation where reports conflict. |
| `README.md` | Short repository orientation and operations guide; this file is the longer AI handoff. |

The repo has no root `LICENSE`/`COPYING` file in the checked tree. Confirm the owner's desired license and permission for redistribution before publishing copied source in another repository.

## 11. Reuse this code in a second project

There are three valid strategies. The right one depends on what the second project is meant to ship.

### A. Copy the complete Compass code

Use a separate checkout/repository or vendor the project into a clearly named subdirectory. Preserve `public/`, `src/`, `wrangler.jsonc`, `package.json`, data builders, tests and required `docs/` together. Check how Cloudflare Workers are named/deployed so the new project does not overwrite or route the original Worker. Configure separate Cloudflare secrets/KV/Worker resources for the new product unless shared production data is intentional and approved.

Good fit: the second project is a fork/rebrand or should run substantially the same product. Trade-offs: large codebase, bundled snapshots, GNDEC-specific assumptions, shared-worker/API setup, source update schedule and profile model remain to be adapted.

### B. Integrate Compass as one module/service inside a larger application

Keep the main application's UI and add a Compass route/component or same-origin service. Define the integration boundary explicitly: how the host supplies the active section/subsection, user identity (if any), the chat transcript, navigation, error states and source links. If embedding in an iframe, agree on a small documented `postMessage` contract and origin allowlist; do not read another page's local storage. If colocating source, avoid duplicate element IDs, global event handlers, global CSS and conflicting service workers. Prefer extracting/reusing the specific parser/domain module plus its tests rather than trying to import the entire large `app.js` as if it were a standalone library.

Good fit: Compass is one feature in a new portal. Trade-offs: test the host/Compass boundary, accessibility, styles, CSP, refresh strategy, identity and time-zone semantics.

### C. Re-create selected behavior from this reference

Treat this document and the source code as design/behavior reference. Build the new product in its own framework/data model, but port only the approved features. Reimplementing a timetable card is straightforward; reproducing source validation, fuzzy roster privacy, historical source handling, exam import validation and fallback semantics requires explicitly porting those rules and corresponding tests. A README alone is not a substitute for datasets, parsers, Worker routes, profiles or domain modules.

Good fit: a smaller, visually related, new product. Trade-offs: parity is not automatic, and incorrect recreations can show fabricated timetables or expose roster identifiers.

### Practical integration sequence

1. In the new repository, read this handoff and the source/config files it references; have the agent report which strategy it chose and why.
2. Start with read-only, deterministic features: verified timetable source → parser → validated section/subsection state → scoped answers. Keep external inference disabled until those boundaries work.
3. Write an explicit source/provenance contract for each dataset. Define what answer is returned when a source is stale, partial, missing, or contradictory.
4. Separate reusable domain code from GNDEC web UI and owner/admin deployment code. Preserve the legacy local fallback as a standalone callable path if the Brain chain is used.
5. Add privacy tests before any student roster/profile integration. Test exact identifiers, duplicate names, unsupported scope, changed selection, missing source, stale revision, and fallback.
6. Decide whether the second product has its own sign-in, storage, domain, Cloudflare Worker/KV, branding, source ownership and privacy notice. Do not reuse production secrets, student profiles or live exam publication as sample data.
7. In the second project's README, state which parts are copied, adapted, omitted, replaced or still planned. Document external-service requirements and test against its own fixtures.

## 12. Implemented versus planned or unavailable

The root `features-specification.md` is a proposed product/feature specification. Its contents include aspirational features such as voice-first chat, cross-device account sync, learning-path tracking, mental-health self-assessments, career/placement statistics, community matching, professor feedback, scholarship tracking, predictive questions, and building-digital-twin simulations. Presence in that specification is **not** evidence those products have been implemented.

Do not advertise these as current features unless new code/data is added and verified. The same applies to dashboard mock counts, generic file names, demo fixtures, and admin operations that explicitly return HTTP 501. Current user-facing features are those described in sections 3–5 and proven by current code and data. College-life answer patterns that link to the official notice/page do not imply a corresponding live database.

Other boundaries that should remain visible in any clone:

- No attendance ingestion; only a user-input calculator.
- No cross-device student account/profile sync or verified student login in the ordinary experience.
- No trustworthy identity based on the editable browser profile/KKJ shortcut alone.
- No universal historical timetable archive unless the active registry/data explicitly has one.
- No exact campus route, room floor plan, transport timetable, placement statistic, live club feed, current hostel rule set or current appointment registry implied by a link-only response.
- No full exam seating in the current checked-in exam seed. Query current `/api/exams` before claiming a live publication has seats.
- No LLM required for local timetable, calendar, roster, syllabus and calculator paths.
- No guarantee that third-party models or changing official websites remain available.

## 13. Verification and maintenance for the next agent

The repository's operational checks are:

```powershell
npm test
npm run lint
npm run build
```

Test fixtures and outputs can describe earlier releases; a passing test does not establish the live Worker secret values, the current external GNDEC sources, current production KV data, official ownership, or legal rights to redistribute the code. Keep the asset query revisions in `public/index.html` and `public/sw.js` aligned on each frontend release.

When an agent changes answer routing, verify the same question through the independent Brain engines and `legacyAnswerWithoutAi()` fallback. When it changes a data parser or result format, trace the verified source and its tests; do not update a seed only to make a test pass. For publication changes, keep date/source/revision/rollback behavior coherent across domain validator, store, API response, browser cache and admin preview. Preserve existing user code, secrets, generated/private records and uncommitted work.

## 14. Primary reference files

Start here when an AI agent needs to verify a claim in this handoff:

- Product and local/deploy setup: `README.md`, `package.json`, `wrangler.jsonc`.
- User pages and their controls: `public/index.html`, `public/styles.css`.
- Routing, data loading, selection and fallback: `public/app.js`.
- Deterministic engine order, result validation and scope rules: `public/brain-kernel.js`, `public/brain-v2-2.js`, `public/brain-v1-2.js`, `public/brain-v2.js`, `docs/compass-brain.md`.
- Official source registry and network boundary: `src/worker.js`.
- Exam data and safety/provenance: `public/exam-domain.js`, `public/exam-schedule.js`, `public/practical-exams.js`, `public/data/exam-summary.json`, `docs/exam-date-sheet.md`, `docs/exam-publishing.md`.
- Regression contracts: relevant files under `test/`.

