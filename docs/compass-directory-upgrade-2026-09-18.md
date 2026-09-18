# Compass directory and timetable upgrade — 18 September 2026

## Delivered changes and their purpose

- **Tutorial badges:** the Timetable page displays a small accessible `T` badge
  when the published event type is T, across weekly orientations and list views.
  Subject wording never invents an activity type. Lecture labels remain optional.
- **Student lookup:** `public/data/student-roster-index.json` contains 1,146
  records parsed from all seven official permanent-section PDFs dated 15 September:
  CE 127, CS 379, EC 128, EE 128, IT 191, ME 128, RAI 65. Parent details and birth
  dates are excluded. Profile and chat reuse the same loader.
- **Speed:** memory/device cache and a compact bundled index avoid downloading
  and parsing seven PDFs for each first lookup. Concurrent loads share a promise.
  Schema, source URLs/revisions, branch completeness and a 24-hour freshness
  limit are checked. Missing indexed names retry the original official PDF path.
  PDF requests are bounded, and an in-flight source revision cannot replace the
  cache with data from the previous registry. Offline lookup requires a valid
  previously cached index; first visits still need a download.
- **Faculty data:** `public/data/faculty-directory-index.json` contains 272
  official faculty/staff records across 14 directory departments, with 272
  successfully checked professional profiles. The shared faculty loader tries
  the snapshot before the live API. Missing indexed matches retry the API.
- **Contacts:** `public/data/faculty-contacts.json` records 20 published
  administrative roles and 34 individually sourced supplements. Search results
  include a collapsed Office & contact details panel with published landline,
  phone, email, provenance and check date. Mentor numbers are explicitly labelled
  as public mentoring contacts; shared role-office lines are not personal lines.
- **Identity safety:** named faculty contact requests no longer become student
  searches. “Give me” no longer means Mechanical Engineering. Partial names in
  the active timetable cannot replace a different person's full name. General
  normalization preserves “number” in phone-number questions.
- **Role lookup:** “our HOD” uses the active profile branch. Principal and dean
  responsibility queries use published role records. A generic dean query asks
  which responsibility. The administration and ERP pages disagree about Dean
  Alumni and Chief Warden; those results explicitly retain the conflict.
- **Free rooms:** `public/room-availability.js` filters the complete loaded room
  timetable by published S/F/G/A prefixes or Automobile/IT/CSE labels and checks
  occupancy at a specific day/time. A class occupies its start time but not its
  end time. Missing views, unknown areas, invalid dates and ambiguous times fail
  safely. Results say “no class listed”; they do not promise physical access or
  permission. The dataset may not include every room on campus.
- **Maintenance:** `npm run build:directories` refreshes the official indexes.
  The former mock-fact writer in `scripts/update-brain-knowledge.mjs` now calls
  the verified builders. The application shell revision includes the new indexes
  and module. No external inference API or embeddings were added. The independent
  `legacyAnswerWithoutAi()` remains available.

Shared routing and rendering make these improvements available across Brain 1,
1.2, 2 and 2.2. Four separate copies of the factual database are not needed.

## Official research and missing information

- [Official timetable and roster index](https://appsc.gndec.ac.in/time_tables)
- [Official faculty directory](https://gndec.ac.in/faculty/)
- [Administration and role contacts](https://gndec.ac.in/?q=node/6)
- [ERP role listings used for conflict checking](https://erp.gndec.ac.in/gndec)
- [ECE department](https://ece.gndec.ac.in/): published ground-floor Electronics
  Block location for the HOD contact office.
- [IT department](https://it.gndec.ac.in/): published HOD contact number.

Most individual faculty cabins are not published in these sources. Unknown
offices remain “Not published.” Teaching rooms and mentoring venues are not
treated as offices. These records cover the public directory, not proof of every
current college employee or appointment. No project can honestly guarantee
perfect understanding or zero future upstream changes.

Directory snapshots age out after 24 hours and live lookups remain the fallback.
This release does not install an automatic GitHub refresh workflow. Role/contact
snapshots show their check date and need periodic review. Reviewed supplemental
office/contact facts should be rechecked when updating the data. Official weekly
room schedules do not include every booking, closure or special-date override.

## Try these questions

- `Chahat Jain phone` / `give me Chahat Jain email`
- `Munish Rattan office`
- `who is our HOD` / `dean academics phone` / `list all HODs`
- `find Kaushik Jain` / `students in ECB1`
- `which rooms are free in S Monday at 2 PM`
- `free rooms in F and G Tuesday at 10:30`
- `which CSE rooms are free now`

## GitHub and GitHub Actions — recommendations only

Keep the repository as the reviewed source of code, fixtures and source metadata.
Use branches and pull requests for larger changes, Issues for reproducible query
failures, and release tags to identify a deployable version.

An Actions workflow could run `npm ci`, tests, lint and the production dry run
before deploying main. Keep the Cloudflare API token in GitHub secrets, use a
scoped Workers deployment token and restrict the production environment. A second
scheduled workflow could check official links and propose a data-update pull
request after validating counts, identities and source changes. Failed scrapes
must preserve the last verified dataset. Use one deployment owner to avoid
duplicate deployments from both Workers Builds and Actions.

References: [GitHub Node.js testing](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs),
[Cloudflare Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
No Actions workflow was created, as requested.

## Recommended next improvements — not implemented in this release

| Area | Improvement | Data needed |
| --- | --- | --- |
| Brain 1 | Keep the small, reliable fallback and improve clarification messages | Versioned factual records and regression examples |
| Brain 1.2 | Protect recognized names/codes before language normalization; improve typed entity indexes | Verified aliases, role titles, name variants |
| Brain 2 | Compose retrieval, counts and interval calculations through a shared typed plan | Timetable versions and explicit applicability dates |
| Brain 2.2 | Track resolved entities and dates across follow-ups; validate every requested subtask | Short-lived dialogue state and clarification choices |
| Shared validation | Reject unsupported facts and incomplete multi-part answers before rendering | Evidence/source IDs per returned fact |
| UI/UX | Show a compact interpretation line and editable date/entity chips | The resolved query plan |
| Timetable | Explain changes between releases and add a dedicated room/time selector | Archived verified releases and room labels |
| Settings | Offer cache size, last check, manual refresh and clear-local-data controls | Cache metadata |
| Admin | Review source differences and conflicts before publishing; retain rollback history | Signed-off source snapshots and validation reports |
| Faculty | Expand offices, accessibility directions and role coverage | Official office directory, department notices or confirmed campus map |
| Exams | Add revised sitting/room data with revision warnings | New official date sheets and seating plans |

Prioritize entity protection, source/version validation and composable bounded
plans before adding another numbered Brain. That produces more reliable
reasoning while retaining deterministic execution and the existing fallback.

## Verification

Automated tests cover tutorial rendering, shared selection state, concurrent and
offline index loading, outdated/partial indexes, source changes, missing-name
fallback, all 272 official faculty names, contact disclosures, active-profile HOD
lookup, conflicting roles, professional-field privacy, and room occupancy across
seven area types, boundaries and malformed requests. Existing query, date,
comparison, exam, roster-parser and Worker tests remain part of `npm test`.

The live audit checked 2,250 official timetable queries with zero failures and
parsed every numbered row of all seven current rosters. All 272 faculty names
were tested for correct identity or explicit ambiguity. Tests run sequentially
so the existing timing assertion is not distorted by concurrent CPU-heavy tests.
`npm test`: 274 passed, zero failures. `npm run lint` and `npm run build` passed.
The contact builder was rerun successfully against the official sources. Browser automation was
unavailable; automated DOM checks are not a claim of visual desktop/mobile review.
