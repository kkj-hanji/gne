# Compass Brain (engines 2.11.0, 1.2.0, 2.2.0, kernel 1.0.0)

Compass Brain is a browser-side deterministic reasoning layer. Every engine uses no LLM, embedding service, or external inference dependency.

## Layered brain chain

Since the 2026-08-25 upgrade, three independent deterministic engines share one kernel and are tried in order:

| Engine | File | Version | Global | Specialties |
| --- | --- | --- | --- | --- |
| Brain 2.2 | `public/brain-v2-2.js` | 2.2.0 | `CompassBrainV2_2` | Timetable comparison (`ECB vs ECB2`, scoped day follow-ups), pending-clarification consumption |
| Brain 1.2 | `public/brain-v1-2.js` | 1.2.0 | `CompassBrainV1_2` | Student roster lookup with privacy gates, faculty directory search, safe arithmetic incl. word numbers, modulo, percent-of, linear equations |
| Brain 2 | `public/brain-v2.js` | 2.11.0 | `CompassBrainV2` | Original timetable reasoning engine (below) |

`public/brain-kernel.js` (kernel 1.0.0, `CompassBrainKernel`) holds the shared primitives: multilingual normalization (English/Hindi/Punjabi/Hinglish), bounded conversation memory with revision invalidation, safe recursive-descent arithmetic, linear-equation solving, ISO calendar helpers, person-name matching, and HTML-safe result factories. The kernel and both new engines are dependency-free IIFEs; they no-op cleanly if the kernel fails to load.

`runCompassBrain()` in `public/app.js` walks the chain `[V2_2, V1_2, V2]`, validates each result, and falls through on decline, low confidence, or failure. External AI is never part of this chain.

## Answer flow

1. `public/app.js` routes app-owned questions first: mentoring answers, official timetable views, explicit selection, contextual follow-ups.
2. `runCompassBrain()` then tries each chain engine in order under the same verification rules.
3. A result is accepted only when it is handled, verified, above the confidence threshold, has a non-empty answer, and stays within the plan-depth limit.
4. Unsupported, uncertain, malformed, or failed results transparently fall back to `legacyAnswerWithoutAi()` in `public/app.js`.
5. Open-ended questions may continue to the app's separately configured AI path. No brain ever calls it.

College catalogue questions are handled at the deterministic application boundary when a verified checked-in or official source exists. For example, spelling variants of `how many branches do we have?` return the current seven B.Tech engineering branches used by Compass: CE, CS, EC, EE, IT, ME, and RAI. This answer is explicitly scoped to B.Tech engineering branches and links to GNDEC's broader official programme catalogue rather than treating all UG/PG programmes as the same count.

The legacy engine remains independent and callable for regression and fallback tests.

## Local context

Brain stores a bounded six-turn context containing only timetable references such as active subject, teacher, room, calendar day, the active and previous class IDs, and normalized recent queries. The two class IDs preserve relational follow-ups such as `after that` followed by `same room?`. Context is cleared when the active profile, group, or subgroup changes and when chat is cleared.

Engine 2.11.0 includes verified teacher-to-subject mappings (including co-teachers), weekday and weekend handling, first/last/finish questions, class and free-time totals, internal break calculations, lightest-day and most-used-building comparisons, before/after-time filters, venue wording, arithmetic precedence, relative-date answers, structured syllabus routing, and active-profile facts including CRN, current/previous serials, registration, section, subsection, mentoring group, mentor, and venue. `next <subject> class` selects one future occurrence rather than returning the weekly catalogue. Subject adjacency uses an active contextual occurrence first, then an explicitly requested day, then the next future occurrence; when no safe anchor exists it asks for a day or time instead of selecting an arbitrary weekly row.

Compound timetable questions are split into a bounded set of clauses, with teacher, room, availability, and schedule facts kept attached to the subject that requested them. For example, `when is Physics and who teaches Math and when` returns separate verified Physics and Math sections instead of collapsing to one next class.

Faculty lookup is progressive. A verified directory identity is rendered as soon as the directory resolves; professional profile fields and the official photo enrich the same answer afterward. The public directory and enriched professional records are cached on the device for up to 24 hours, concurrent requests are coalesced, and normal browser/edge caching is respected. Missing, corrupt, expired, or failed caches never bypass source verification.

Native Hindi and Punjabi normalization retains Unicode combining marks, while English, Hinglish, and transliterated Punjabi continue through the same deterministic alias system. Inputs, plans, context, and rendered answers are bounded; unsafe or malformed markup is rejected independently by both the Brain and application boundary before the legacy fallback is used.

`CompassBrainV2.getMetrics()` returns in-memory aggregate counts for handled intents, fallback reasons, coverage, and processing time. It never retains raw query text, profile values, or timetable facts.

## Kill switch

The deterministic chain is enabled by default. Development overrides are:

- `?brain=legacy` — legacy-only for that page load.
- `?brain=v2` — Brain 2 only for that page load.
- `?brain=v12` — Brain 1.2 then Brain 2 for that page load.
- `?brain=v22` — the default full chain (Brain 2.2 → 1.2 → 2).
- `localStorage['gndec-compass-brain-v2-enabled-v1'] = 'false'` — persistent device disable.

No internal fallback code or diagnostic is shown to normal users. The latest sanitized diagnostic is kept only in application memory for development.

## External AI boundary

Admin-selected models remain separate from Brain 2 and the independent legacy fallback. Their prompt receives a bounded safe projection of Compass knowledge: the complete active timetable, derived subject/teacher/room catalogues, the verified B.Tech branch catalogue, a relevant official syllabus record, and public professional fields for a specifically resolved faculty record. It does not receive student identifiers, mentor details, the entire faculty directory, or every website/PDF in one request.

Directly grounded catalogue answers are checked after model generation, so a model cannot contradict or claim absence of a fact already present in the verified context. A preferred model that times out before emitting text can fall through to the next configured model. If all model attempts fail, Compass uses a natural deterministic answer or clarification without exposing model, network, local-processing, or fallback internals to students.

## Privacy contracts

- A bare student name never auto-searches the private roster; it asks whether the person is faculty or a student.
- Duplicate-name matches show only name, branch, and section. Choosing a numbered candidate resolves to `PENDING_RESOLVED`, which reveals the chosen name and section but **never** a CRN, registration number, or serial — the full record requires an explicit re-query with the section or an exact identifier.
- Roster enumeration attempts (`list all students`, `how many students are in ECB?`) fail closed with guidance instead of falling through to person search.
- Non-Latin (Devanagari/Gurmukhi) input is never treated as a bare person name.
- Comparison answers state their scope, source revision, and "Profile unchanged"; stored comparisons are invalidated when the dataset revision changes.

## Tests

Run `npm test`. `test/brain-v2.test.mjs` covers deterministic conversation, calculations, exact and relative dates, timetable catalogues, teacher and room relationships, free periods, time ranges, structured syllabus facts, multilingual typos, context, reasoning, routing collisions, corrupted records, kill-switch behavior, and forced fallback failures.

`test/brain-new.test.mjs` covers kernel memory bounds and revision invalidation, Brain 1.2 privacy flows (unique/duplicate/bare/faculty), Brain 2.2 comparison chains, stale comparisons, pending-clarification consumption, script load order, service-worker precache, app chain integration, kill switch, cross-brain fallback, plus stress-campaign regressions: day-after-tomorrow aliases in Hindi/Punjabi, versus-guard routing, fuzzy faculty typos, India-clock questions, closest-match weekdays, room schedule views, word-number/modulo arithmetic, and roster enumeration fail-closed behavior.

`scripts/stress-probe.mjs` (62 probes) and `scripts/stress-probe-2.mjs` (51 probes) drive the real `answerWithoutAi` pipeline through a vm harness across four languages, calculation torture tests, comparison memory chains, and privacy red lines. Run them directly with `node scripts/stress-probe.mjs` and `node scripts/stress-probe-2.mjs`; they are not part of `npm test`.
