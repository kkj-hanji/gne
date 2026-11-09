# GNDEC Compass Next

`GNDEC Compass Next` is the new, fully static-first Compass app. It ships as its
own Cloudflare Worker (`gndec-compass-next`) next to the existing production
Worker, which stays deployed and untouched as the frozen legacy build.

- New app: <https://gndec-compass-next.koush3069.workers.dev>
- Frozen legacy app: <https://gndec-compass.koush3069.workers.dev>
- Repository: <https://github.com/kkj-hanji/gne>

The two apps run on different origins and therefore different service-worker
scopes. Neither cache, rollback or deploy can overwrite the other. The legacy
build is always reachable from the new app's Settings page and from the sidebar
"Legacy build" card.

---

## 1. What the new app adds

| Area | Change |
| --- | --- |
| Pages | `Today`, `Timetable`, `Rooms`, `Ask`, `Notices`, `Directory`, `Compare`, `Settings` |
| Settings | 104 typed flags in 12 categories, 6 one-click presets, searchable, URL-overridable |
| Ask Compass | Deterministic multi-engine chain with Hinglish / Punjabi-in-Latin / Hindi-in-Latin / English understanding and safe fallback |
| SEO | Per-route metadata and JSON-LD injected by the Worker, 270 pre-rendered static college pages, sitemap, robots, OG cover |
| PWA | Installable, offline shell + cached verified data, update banner |
| Data | Reuses the verified legacy release through an allow-listed read-only proxy |
| Automation | CI, daily data refresh, daily live verifier, GitHub issue on failure |

---

## 2. Architecture

```text
Browser
  │
  ├─ https://gndec-compass-next…          ← new Worker (assets: next/)
  │     ├─ /, /today, /timetable, /rooms, /ask, /notices, /directory, /compare, /settings
  │     ├─ /college/…                     ← pre-rendered static SEO pages
  │     ├─ /sitemap.xml, /robots.txt, /og.svg
  │     ├─ /api/version, /api/health
  │     └─ /api/legacy/*                  ← allow-listed proxy
  │
  └─ https://gndec-compass…               ← frozen legacy Worker (assets: public/)
        ├─ /api/timetable, /api/sources, /api/faculty, /api/syllabus, /api/chat
        ├─ /data/*.json                   ← roster, faculty and syllabus indexes
        └─ /brain-*.js                    ← engine scripts reused by the bridge
```

### Worker responsibilities

`src/next-worker.js` exports `fetch`. The implementation lives in
`src/next-core.js`:

1. Serve `next/` assets with long-lived immutable caching for hashed/static
   files and `no-cache` for HTML.
2. Inject route-specific `<title>`, description, canonical, Open Graph,
   Twitter card and JSON-LD into the static shell for every app route, so a
   crawler with or without JavaScript sees correct metadata.
3. Proxy only allow-listed legacy paths under `/api/legacy/`, with:
   - strict path validation and URL-encoded traversal rejection,
   - no forwarding of cookies or hop-by-hop headers,
   - `X-Compass-Proxy: legacy` and `X-Compass-Legacy-Origin` response markers,
   - 304 responses passed through untouched (no accidental body rewrite),
   - rewritten HTML documents dropping upstream `ETag` / `Last-Modified` and
     using `Cache-Control: no-cache`,
   - a small Cache API cache for GET data,
   - `502` with a machine-readable message when legacy is unreachable.
4. Expose `/api/version` and `/api/health` with app, legacy and engine state.
5. Add security headers (`nosniff`, referrer policy, frame options, permissions
   policy) to every response.

`wrangler.next.jsonc` sets `assets.directory = "next"` and
`run_worker_first` for `/api/*` plus the eight app routes, so the Worker — not
the asset server — owns routing and metadata.

---

## 3. Data provenance

Compass never invents timetable, teacher, room, profile or syllabus facts.

- The verified release lives in the frozen legacy Worker and in the local
  `.cache-next/` snapshot used for static generation.
- The new app reads it through `/api/legacy/…` only. Allowed paths are listed in
  `src/next-core.js` and cover the timetable HTML, source registry, section
  list, faculty index/profile/photo, syllabus index, chat, `data/*.json` and the
  published Brain / notices / calendar scripts.
- Everything else is refused with `403`.
- Static SEO pages are generated from the same release, so a crawler and a
  student see identical section, subject, teacher and room facts.
- Absent or unverified data is shown as absent. Compass does not fill gaps with
  guesses.

The release label shown in the UI is read at runtime from `/api/sources`; it is
not hard-coded into the bundle.

---

## 4. Ask Compass

Ask Compass keeps the original `legacyAnswerWithoutAi()` path available as the
independent, deterministic fallback. On top of it, the new chain adds:

- `next/engine/language.js` — normalisation for English (US/UK/Indian),
  Hinglish, Punjabi written in Latin script, Hindi written in Latin script,
  mixed input, shortforms, abbreviations, subject codes and nicknames.
  It uses fixed transliteration tables, phrase and word synonym maps, and
  bounded Levenshtein + Dice fuzzy matching. No model, no embeddings, no
  network call.
- `next/engine/answer.js` — the deterministic planner and answer contract.
- `next/engine/brain-bridge.js` — reuses the verified Brain engines
  (`brain-kernel.js`, `brain-v1-2.js`, `brain-v2-2.js`, `brain-v2.js`) when they
  return a verified result.
- `next/engine/datetime.js`, `fet-parser.js`, `free-rooms.js` — calendar,
  timetable parsing and room availability.
- `next/engine/ics.js`, `reminders.js` — calendar export and local reminders.
- `next/engine/storage.js` — device profile, snapshots and persistence.

Rules enforced by the pipeline and its tests:

1. Every personalised answer uses the active device profile and timetable
   selection. There is no "default student".
2. Uncertain, malformed, oversized, unsafe, unverified or failed Brain results
   fall back to `legacyAnswerWithoutAi()`.
3. Plans are bounded and browser-friendly; no unbounded loops, no large
   intermediate strings, no blocking work.
4. The optional external AI path is opt-in, never receives timetable facts, and
   is never the only source of an answer.

Supported input examples:

| Input | Language shape |
| --- | --- |
| `meri agli class kadon hai` | Hinglish |
| `meri next class kithe hai` | Hinglish / Punjabi mix |
| `menu apni timetable chahidi hai` | Punjabi in Latin script |
| `meri agli class kab hai` | Hindi in Latin script |
| `phy da lab kithe hunda` | Punjabi + subject abbreviation |
| `CSD 2nd sem timetable` | English + section + semester |
| `wt is free room rn?` | shortforms and broken input |

---

## 5. Settings

`next/settings-registry.js` defines:

- 12 categories: Experience, Appearance, Navigation, Today, Timetable, Rooms,
  Ask Compass, Data & offline, Notifications, Privacy, Accessibility,
  Advanced & Labs.
- 104 flags with stable dotted ids, types, defaults, dependencies, risk levels
  and search keywords.
- 6 presets: Balanced, Battery saver, Data saver, Accessibility, Exam week,
  Developer.
- Precedence: URL parameter → admin override → device setting → registry
  default.
- Legacy migration: existing `gndec.compass.*` keys are read once and mapped to
  the new schema.
- Labs are off by default and individually reversible.

`next/settings-store.js` persists to the device, validates values on read, and
never sends settings to a server.

---

## 6. SEO

- `next/seo-meta.js` is the single source of route titles, descriptions,
  keywords, canonicals, Open Graph, Twitter cards and JSON-LD. It is imported by
  the Worker, the browser app and the static generator, so all three agree.
- `scripts/build-next-seo.mjs` pre-renders:
  - `/college/section/<slug>/`
  - `/college/subject/<slug>/`
  - `/college/teacher/<slug>/`
  - `/college/room/<slug>/`
  - `/college/exam-datesheet/`
  - `sitemap.xml`, `robots.txt` and the SVG Open Graph cover.
- Static pages are regenerated from the verified release and stale pages are
  removed, so the site cannot advertise a section or teacher that no longer
  exists.
- The generator reads only the live release or the local `.cache-next`
  snapshot, and refuses a source that contains replacement characters, so a
  truncated or mis-decoded body can never be published as fact.
- Canonical origin defaults to
  `https://gndec-compass-next.koush3069.workers.dev` and can be overridden with
  the `PUBLIC_ORIGIN` Worker variable.
- `robots.txt` points at the sitemap; every route and every generated college
  page is listed exactly once.

Build the SEO surface with:

```powershell
npm run build:seo
```

---

## 7. PWA and offline

`next/sw.js` uses three strategies:

- **Shell** — cache-first with background refresh for HTML, CSS, JS, icons and
  the manifest.
- **Data** — network-first with a cached copy when offline, for `/api/*`.
- **Navigation** — network-first, then the cached route or the cached shell; it
  never guesses an offline error page.

The cache name is versioned (`compass-next-v2.2.0`), old `compass-next-*` caches
are deleted on activate, and the update banner calls `SKIP_WAITING`. Installing
the app stores the shell, so the next launch works without a network as long as
the relevant data was cached.

---

## 8. Compatibility

The layout is tested from 320 px phones to ultrawide desktops, at 90–200 %
browser zoom, in portrait and landscape, with and without dynamic browser
chrome.

- Fluid `clamp()` sizing, `rem` typography, `dvh`/`svh` viewport units.
- Safe-area insets for notches and gesture bars.
- 44 px minimum touch targets.
- Overflow guards on every grid, table and long identifier.
- Forced-colors, high-contrast, reduced-motion and print media support.
- No horizontal page scroll at any supported width.
- Works in Chrome, Brave, Edge, Firefox, Safari (iOS/macOS), Samsung Internet
  and the Android WebView shell.

---

## 9. Local development and checks

```powershell
npm run dev:next        # http://localhost:8788
npm run build:seo       # regenerate static college pages + sitemap
npm test                # full repository test suite
npm run lint            # syntax checks for every shipped script
npm run build:next      # wrangler dry-run for the new Worker
npm run verify:next     # live verification of the deployed app
npm run probe:next      # end-to-end Ask probes against the live app
```

Focused suites:

```powershell
node --test test/next-engine.test.mjs
node --test test/next-language.test.mjs
node --test test/next-worker.test.mjs
node --test test/next-seo.test.mjs
node --test test/next-pwa.test.mjs
node --test test/next-settings.test.mjs
```

The suite covers the deterministic answer contract, multilingual normalisation,
Worker proxying and 304 handling, SEO metadata and static generation, the PWA
shell/config contract, and the 104-flag settings registry.

---

## 10. Deploy, rollback and automation

```powershell
npm run deploy:next     # wrangler deploy -c wrangler.next.jsonc
npm run deploy:legacy   # wrangler deploy -c wrangler.legacy.jsonc
```

- The legacy Worker is intentionally frozen and has no cron. The production
  Worker keeps doing scheduled source verification, so two writers never race
  on the same KV registry.
- The new Worker has no KV dependency for its own assets; it reads verified data
  only through the legacy proxy.
- Rollback to the old UI is a single Settings switch (Experience → Legacy) and
  always opens the separate legacy origin. No redeploy is needed.
- Data rollback is available from device snapshots in Settings.

GitHub Actions:

| Workflow | Schedule | Purpose |
| --- | --- | --- |
| `next-ci.yml` | push / pull request | lint, test, SEO build, Worker dry-run |
| `next-refresh.yml` | daily 20:40 UTC | verify sources, rebuild SEO pages, commit changes, deploy if `CLOUDFLARE_API_TOKEN` exists |
| `next-verify.yml` | daily 02:15 UTC | live health/SEO/route checks, opens an issue on failure |

Secrets: add `CLOUDFLARE_API_TOKEN` (and account id if required) to enable
scheduled deploys. Without it the refresh still rebuilds and commits the
generated pages, and the verifier still reports failures as GitHub issues.

---

## 11. Privacy

- Device profile, settings and snapshots stay in local storage.
- Directory and student searches run on the device; the new app does not add a
  server search endpoint.
- The legacy proxy forwards only public, allow-listed paths.
- Cookies and hop-by-hop headers are never forwarded.
- The optional external AI path is opt-in and receives no timetable facts.

---

## 12. Important files

| File | Role |
| --- | --- |
| `wrangler.next.jsonc` | New Worker config, routes and origins |
| `wrangler.legacy.jsonc` | Frozen legacy Worker config |
| `src/next-worker.js` | Worker entrypoint (`fetch` only) |
| `src/next-core.js` | Assets, SEO injection, legacy proxy, health |
| `next/index.html` | Application shell and navigation |
| `next/boot.js` | Boot, settings hydration, service-worker registration |
| `next/app.js` | Routes, state, renderers, universal search |
| `next/styles.css` | Design system and compatibility hardening |
| `next/sw.js` | Offline shell and data caching |
| `next/seo-meta.js` | Shared route metadata and JSON-LD |
| `next/settings-registry.js` | 104 flags, 12 categories, 6 presets |
| `next/settings-store.js` | Device persistence and migration |
| `next/engine/*.js` | Language, answer, Brain bridge, timetable, rooms, storage, reminders, ICS |
| `scripts/build-next-seo.mjs` | Static pages, sitemap, robots, OG cover |
| `scripts/verify-next-live.mjs` | Live verification |
| `scripts/probe-next-ask.mjs` | Live Ask probes |
| `test/next-*.test.mjs` | Contract tests for every subsystem |
