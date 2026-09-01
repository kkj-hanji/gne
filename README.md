# GNDEC Compass

A public, per-device GNDEC timetable companion. Each student chooses or finds their own section and subsection; that choice, chat history, and parsed timetable stay in that browser. One student's setup never changes another student's Compass.

## What it does

- Begins as a neutral device setup instead of pretending every visitor is one student.
- Lets a student find their official profile from GNDEC's current branch rosters using name, CRN, registration number, or serial number, or save a manual section/subsection choice.
- Parses official FET timetable HTML locally, including parallel subgroup practicals.
- Answers factual timetable questions locally: current/next class, day schedules, rooms, teachers, and all matching subject classes across the week. These requests never use AI.
- Answers verified college catalogue questions such as the current seven B.Tech engineering branches, while distinguishing that branch scope from GNDEC's broader UG/PG programme catalogue.
- Sends only genuine open-ended study questions to the configured external AI; names, CRNs, registration numbers, current/old serials, and mentor details are removed in both the browser and Worker.
- Discovers the current official sources from `https://appsc.gndec.ac.in/time_tables`, validates them, and keeps a previous verified registry when GNDEC changes its filenames or links.
- Has a verified `R4` bootstrap source so first-load still works while GNDEC or KV is temporarily unavailable.

## Source update design

The Worker runs every four hours using the Cron Trigger in `wrangler.jsonc`.

```text
GNDEC /time_tables
        ↓ discover current labelled links
validate all six FET HTML files + published student PDFs
        ↓
Cloudflare KV active source registry
        ↓
public timetable / student-list APIs
```

Validation requires an official `appsc.gndec.ac.in` URL, downloadable content, FET timetable markers and weekdays for HTML, and a real PDF header for student lists. A failed discovery never overwrites the active registry. The old verified registry and edge cache remain available.

The current source status is exposed at `/api/sources`. The browser compares saved timetable and roster content revisions with this registry on startup, whenever the tab returns, and every 15 minutes. A source can therefore update even when GNDEC reuses the same URL or displayed effective date.

## Roster and profile updates

Current Permanent Sections PDFs are parsed by table column: `S.No.`, `CRN`, student name, branch, section, subsection, mentoring group, mentor, mentor phone, and mentor venue. Parent names are deliberately discarded. Mentor contact details remain in the selected on-device profile and deterministic Compass answers, but are removed before external AI inference. Profile lookup accepts a name, CRN, registration number, current serial, or an old serial already retained by that device.

After a verified profile is selected, Compass reconciles later public roster revisions by stable CRN or registration number. If the section, subsection, mentor, mentor phone, mentor venue, or serial changes, the verified current record updates and the former serial is retained locally as history. It never auto-matches a changed profile by name or serial alone. An old serial that is not present in a public roster and was never saved on the device cannot be discovered without a future trusted data-import system.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Wrangler, normally `http://localhost:8787`.

Local development works without KV, but it uses the checked-in verified bootstrap URLs and cannot persist source discovery or shared AI limits. Add a KV binding before public deployment.

## Deploy for friends

1. Sign in to Cloudflare: `npx wrangler login`.
2. Create one KV namespace:

   ```powershell
   npx wrangler kv namespace create SOURCE_REGISTRY
   ```

3. Copy the returned namespace id into `wrangler.jsonc`:

   ```jsonc
   "kv_namespaces": [
     { "binding": "SOURCE_REGISTRY", "id": "paste-the-returned-id-here" }
   ]
   ```

4. Add secrets. Do not place these in client code or a public repository:

   ```powershell
   npx wrangler secret put MY_NVIDIA_API_KEY
   npx wrangler secret put ADMIN_API_TOKEN
   ```

5. Deploy:

   ```powershell
   npm run deploy
   ```

`ADMIN_API_TOKEN` protects two owner-only emergency endpoints: `POST /api/admin/sources/refresh` (check GNDEC now) and `POST /api/admin/sources/override` (supply a complete validated six-file official set if GNDEC redesigns its index). It is required—there is no code fallback—and its comparison is case-insensitive, so its configured owner token can be entered with any letter casing. Normal Cron discovery needs no manual link update and no deploy.

Normal students receive **8 AI questions per day** per hashed device-and-network pair by default. You may lower or raise this with the `AI_REQUESTS_PER_DAY` Worker variable (maximum 100). Timetable answers are not limited. For a larger public launch, also configure Cloudflare WAF/rate limiting or Turnstile in front of `/api/chat`.

### Kaushik admin AI mode

The requested hard-coded owner rule is enabled. With a saved profile matching **Kaushik Jain**, owner CRN **2617070**, **EC/ECE**, **ECB**, and **ECB1**, enter this into Compass chat once on the intended device/network:

```text
KKJ
```

After the profile check, KV stores only hashes of that browser's randomly generated device ID and current Cloudflare IP, expiring after 30 days. The browser separately binds the visible admin controls to the exact enrolled name, CRN, registration, branch, section, subsection, and timetable selection. Any identity/profile change immediately removes the local enrollment; changing the values back does not restore it, and `KKJ` must be sent again. Other users remain limited to 8 questions/day.

This is a convenience rule requested for a personal deployment, not strong authentication: a person who can modify browser profile storage could imitate these public profile values. Use Cloudflare Access or a real sign-in provider before treating admin access as security-sensitive. The server maintenance endpoints remain separately protected by `ADMIN_API_TOKEN`.

## Privacy and roles

`localStorage` holds the selected student profile, group/subgroup, chat history, recent name searches, and parsed timetable only on that browser. KV holds only public GNDEC source metadata plus hashed anonymous AI-limit counters. No student roster is copied into KV or D1.

The browser-side Kaushik profile check only controls the interface. The Worker repeats the configured profile check before recording the 30-day admin-AI enrollment, while maintenance APIs require `ADMIN_API_TOKEN`. A visitor can still imitate public profile fields in browser storage, so use Cloudflare Access or verified sign-in before treating the profile rule as security-sensitive.

When special student features need real protection, add verified sign-in first (for example Cloudflare Access with an email allowlist/group). Then the Worker can trust a signed identity and grant roles such as `owner`, `special`, and `student`. Until that identity layer exists, all students receive the same safe public features.

## Verify

```powershell
npm test
npx wrangler deploy --dry-run
```

The tests cover FET subgroup parsing, Permanent Sections/CRN parsing, identifier history, neutral first-visit profile behavior, local profile answers, source revisions, AI privacy redaction, multi-result weekly subject queries, local multilingual timetable routing, accessibility hooks, and safe answer formatting.

## Compass Brain

The local chat answers factual questions through a chain of deterministic engines that share one kernel: Brain 2.2 (timetable comparisons with scoped follow-ups), Brain 1.2 (privacy-gated student roster lookup, faculty directory search, safe arithmetic including word numbers, modulo, and percent-of), and Brain 2 engine 2.11.0 (conversation, exact and relative dates, timetable catalogues, multi-subject compound questions, teacher/subject mappings, verified profile facts, progressive cached faculty lookup, free periods, internal breaks, next-subject occurrences, weekly load/building comparisons, multilingual contextual follow-ups, and bounded timetable reasoning). All of it runs locally with no model or external AI call. Uncertain, ambiguous, oversized, malformed, unsafe, or failed results automatically use the preserved legacy engine.

Room-schedule views (`G6 timetable`), misspelled weekdays (`thusday`), day-after-tomorrow aliases in Hindi and Punjabi, and roster enumeration attempts (which fail closed) are all handled deterministically. Duplicate student matches reveal only name and section until an exact identifier is given.

See [docs/compass-brain.md](docs/compass-brain.md) for the result contract, fallback behavior, kill switch, context rules, privacy contracts, and tests.

## Configured AI grounding

The separately configured AI path receives bounded, structured, verified context instead of only a timetable transcript. This includes the active timetable and its subject/teacher/room catalogues, the seven-branch B.Tech catalogue, a relevant official syllabus record, and public professional details for a specifically resolved faculty member. Personal identifiers and mentor details remain on the device and are not sent for inference.

Known catalogue facts are verified again at the application boundary. A model cannot replace a verified branch answer with a claim that the information is missing. Slow or failed preferred models may fall through to another configured model before Compass returns a natural retry response; user-facing messages do not expose internal routing, connectivity, or implementation details.

## Important files

- `public/brain-kernel.js` — shared deterministic kernel: normalization, bounded memory, safe arithmetic, calendar helpers.
- `public/brain-v1-2.js`, `public/brain-v2-2.js` — newer chain engines for person lookup/arithmetic and timetable comparison.
- `public/brain-v2.js` — original deterministic normalization, context, planning, verification, and response generation.
- `public/app.js` — browser-only student setup, FET parser, timetable engine, and deterministic question routing.
- `src/worker.js` — source discovery, validation, fallback registry, public source proxy, AI proxy and limits.
- `public/index.html` — neutral first-visit UI.
- `wrangler.jsonc` — Worker assets and automatic source-check schedule.
- `scripts/stress-probe.mjs`, `scripts/stress-probe-2.mjs` — 113 end-to-end pipeline probes across four languages; run directly with node, not part of `npm test`.

Never share `.env`, `.dev.vars`, `.wrangler/`, or an archive containing API keys.
