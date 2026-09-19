# Compass research, correctness audit and next steps — 19 September 2026

## Current state

The directory/timetable release is documented in
[the 18 September report](compass-directory-upgrade-2026-09-18.md).
It includes 1,146 student records, 272 professional directory profiles, 20
administrative role records, 34 contact supplements, tutorial badges and
source-grounded room occupancy checks. These are bounded deterministic features,
not evidence of unrestricted natural-language understanding.

The GitHub main branch and live asset checks included the refreshed 272-person
snapshot. The repository has no `.github/workflows` directory. No workflow was
created for this discussion. Existing Cloudflare scheduled source discovery
does not regenerate the bundled student/faculty JSON files.

## Additional correctness fix

The Worker had seven authenticated admin endpoints returning canned successes:
roster QA, syllabus coverage, notice summarization, alias building, query-log
analysis, translation and debug replay. They did not execute those operations.
Some reported invented counts, an accuracy rate, processing time, or the absence
of urgent circulars. They now return an explicit 501 `not_implemented` response
without fabricated results. Authorization remains required.

The holiday fetch previously reported successful verification and synchronization
even when the source returned an error. It now rejects failed upstream responses,
checks for the actual expected PDF hyperlink, and reports only page/link evidence.
It explicitly says the PDF contents were not verified or synchronized.

This fixes misleading reporting; it does not implement those seven admin tools.
Two regression tests cover all seven routes, upstream failure, an ordinary
holiday heading without a PDF, and an actual official PDF link.

Final regression run: `npm test` — 276 passed, zero failures. The earlier
2,250-query official-source audit and directory tests are described in the
18 September report. No visual browser review is claimed.

## Recommended architecture priority

Keep one shared factual store and strengthen the shared planner, entity resolver
and evidence validation. Another numbered Brain alone would add duplication.

For a request such as “compare my next class with Mohitveer tomorrow and tell me
if college is closed,” the planner should preserve separate tasks and dates:
resolve the active person, disambiguate the other person, resolve “next” and
“tomorrow” independently, retrieve applicable schedules, calculate the requested
comparison, check closure evidence, then verify that each requested part has an
answer or an explicit unresolved question. Never transfer one date to every task
without checking the wording.

Build toward this through small modules:

1. Protect names, course/room/cohort codes and date spans before normalization.
2. Produce typed entities and a bounded task plan with explicit dependencies.
3. Retrieve facts by source version, academic applicability and entity identity.
4. Perform interval, count, comparison and date calculations in reusable functions.
5. Attach evidence to each factual result and reject unsupported fields.
6. Preserve only resolved dialogue context; expire it and clear it with the chat.
7. Generate concise answer cards, with clarification choices when necessary.

This improves the appearance of reasoning through composition and context. It
does not provide an LLM's open-domain language understanding or self-training.

| Component | Best next improvement | Additional data |
| --- | --- | --- |
| Brain 1 / legacy | Preserve the independent fallback; make missing-source and clarification messages consistent | Small verified capability/source catalogue |
| Brain 1.2 | Typed name/code matching, alias review and safer typo handling before routing | Verified faculty/student aliases, subject abbreviations and Roman Hindi/Punjabi vocabulary |
| Brain 2 | Reusable retrieval, interval arithmetic, sorting and aggregation operations | Complete typed timetable events, date applicability and revision history |
| Brain 2.2 | Multi-task dependency tracking, date-aware follow-ups and per-task completion checks | Resolved conversational entities and explicit clarification state |
| Shared evidence validation | Check that every fact, date and calculation belongs to the requested entity and release | Provenance, content hashes, validity intervals, conflict records |

## Product and data priorities

- **Search:** exact/prefix matches first, fuzzy matches next; show department and
  entity type on ambiguity choices. Share results between Profile and chat.
- **Timetable:** show changed periods between revisions; offer room area/day/time
  controls and explain tutorial/lab tags. Preserve personal selection when viewing
  another entity's timetable.
- **Chat:** editable entity/date chips, separate cards for multi-part answers,
  source check dates, and an “incorrect interpretation” action that lets the user
  correct the entity rather than retype everything.
- **Settings:** last successful refresh, offline availability, cache size, manual
  retry and clear-device-data controls. Explain what remains usable offline.
- **Admin:** real source health and diff reports, incomplete-import rejection,
  appointment conflicts, reviewed publishing and rollback. Display unavailable
  operations honestly until implemented.
- **Faculty:** official cabins/office locations, role appointment notices, and
  verified contact ownership. Distinguish department address, teaching room and
  individual office.
- **Academics:** batch-specific syllabus schemes, official exam revisions and
  seating plans, make-up class notices, restricted versus closure holidays.
- **Campus:** an official building/room catalogue, accessible routes, opening
  hours and service contacts. Room codes alone cannot establish directions.
- **Quality:** versioned test fixtures, metamorphic tests (capitalization or word
  order should preserve meaning), stale-data tests and measured latency. Obtain
  opt-in feedback instead of collecting private raw conversations by default.

Implement source freshness and identity protection first, then composable plans
and dialogue, then the richer UI. Keep unknown facts unknown during every phase.

## GitHub and Actions proposal — no implementation

Use branches/pull requests for reviewed changes, Issues containing minimal
reproduction queries, and release tags to connect code, tests and deployment.

A suitable future pipeline is:

1. Pull request: install locked dependencies, run tests/lint/dry-run build.
2. Accepted main commit: deploy the same tested revision to Cloudflare.
3. Post-deploy: verify asset hashes, public endpoints and representative queries.
4. Scheduled data job: refresh official indexes, validate row completeness and
   identity/source changes, then open a reviewable data-update pull request.
5. Failed refresh: retain the last verified files and publish a failure report.

The current 24-hour directory snapshot expiry makes automated, validated refresh
particularly useful. Do not merely extend expiry to make stale data appear fresh.
Store deployment credentials as GitHub secrets with limited scope. Do not commit
`.env`, access tokens or private query logs. Choose one deployment mechanism so
Actions and Workers Builds do not both deploy the same commit unintentionally.

Official references checked:

- [GitHub Node.js build and test guide](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
- [Cloudflare deployment with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)

The roadmap above is proposed work, not a list of capabilities already delivered.
