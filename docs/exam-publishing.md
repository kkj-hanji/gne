# Exam notices and seating

Compass uses a validated exam publication, not model training. The Worker serves the current publication; the browser checks it when opened, when returning to the tab, once a minute while visible, and when Profile's update action is used. New published dates and seats feed the same deterministic answer path in every Brain mode.

## Included source data

- Theory date sheet: MSE-I, Semester I, 25 September–1 October 2026, covering all 18 sections in the supplied date sheet.
- Chemistry seating: 570 exact CRNs across nine PDF pages, for **25 September only**, 9:15–10:45 AM; report by 9:00 AM.
- Physics seating: 576 exact CRNs across nine PDF pages, for **25 September only**, 12:45–2:15 PM; report by 12:30 PM.
- EDG Shift 1 seating: 320 assignments across four pages for ME, CE and RAI, on **30 September**, 9:15–10:45 AM.
- EDG Shift 2 seating: 256 assignments across three pages for EE and EC, on **30 September**, 11:00 AM–12:30 PM. This supplied PDF is image-only; its seating grid was transcribed and checked against the printed room/section totals. Its SHA-256 is recorded so the admin importer can recognize this exact scan.
- BEEE Chemistry Group seating: 570 assignments across ten pages, on **30 September**. The source does not supply an additional reporting time.
- Nine Physics Group workshop rows for MEA, MEB, CEA, CEB, EEA, EEB, ECA, ECB and RAI. Both subsections are covered. The three handwritten AM/PM errors use the supplier's confirmed PM corrections.
- Physics, Chemistry and English practical window: 5–9 October, in respective lab turns. Exact individual lab slots are not inferred. The notice's holiday rule moves an affected examination to the corresponding weekday of the following week; an admin must publish the confirmed revised date.

Source PDFs are linked from answers and Profile references. `src/data/exam-source-manifest.json` records PDF hashes, page counts, assignment counts and extraction method. `scripts/build-exam-seed.mjs` rebuilds the bundled seed from the five original PDFs (including the visually verified scan transcription). Supplied documents are labelled as user-supplied; an official website publication is not claimed. The updated publication contains 2,292 seat assignments.

No seating plan was provided for the other theory papers. A student without a matching assignment therefore sees no confirmed seat for that paper. The workshop photo does not establish a workshop date for Chemistry Group sections.

## Student experience

Examples: `my exam room today`, `mera paper kal kithe aa`, `ECB workshop ka paper kab hai`, `CSD2 exam`, `physics group exam`, `my practical exams`, or an exact CRN plus an exam/date. A student's saved CRN is used only when the active section and subsection match that profile. Switching to someone else's timetable never borrows the device owner's CRN.

Today replaces its live class cards and day timetable with the section's theory exam schedule during the published exam period. In Settings ? Today page, Auto (the default) switches back to the timetable at the final sitting's exact end time in IST. Timetable and Exam are persistent manual overrides on this device. Exam mode can show the published dates before the period starts or after it ends, with ended exams labelled. Profile contains no exam card. Upcoming workshop and practical notices appear in a separate banner and expire at their confirmed end time, or after the final day of an untimed window. An ended date remains queryable explicitly as historical information.

## KKJ admin workflow

1. On the authorized owner profile and enrolled device/network, open **Ask Compass**, send the exact message `KKJ`, then open **Settings** and find **Exam publishing**. If the panel stays hidden, confirm that this is the enrolled profile/device/network. The **Publishing key** field expects the value of the Cloudflare Worker secret named `ADMIN_API_TOKEN`; type the secret value, not the setting name. Select **Load current publication**. This key is different from the KKJ switch: KKJ reveals the editor, while the secret authorizes changes.
2. Load the current publication. Select an event, or choose **New event**. Edit subject, kind, sections, date, start/end times, reporting time, provenance and instructions. Save it to the draft.
3. Choose the **Examination date**, select up to three PDFs together, and press **Read files & preview**. Compass reads selectable PDF text on the device, checks duplicate/malformed CRNs, and suggests events using the filename's subject/shift and the selected date. The exact supplied EDG Shift 2 scan is matched by its checked SHA-256 to the transcribed 256-row fixture; unknown image-only plans need a reviewed CSV. Check each suggested event, page/assignment totals and sample seats, then press **Apply confirmed seating to draft**. Only the selected event assignments change in the draft. PDF files are not uploaded. Review the complete publication before **Publish reviewed data**.

   Or paste a simple CSV in the editor below; its columns are `crn,room,row,seat`. To correct one student, use the exact CRN/room/row/S.No. fields. A single correction keeps the other students' assignments.
4. Review the publication. Inspect the import preview and export a backup when reviewing all rows. **Publish reviewed data** applies the draft. Invalid times, duplicate CRNs, occupied positions, malformed records and unsafe source links are rejected.
5. **Restore previous publication** publishes the preceding saved dataset as a new revision. Keep one editing session open at a time. A stale loaded revision is rejected; reload before applying further changes.

The publishing key is kept only in the input's memory and cleared when the admin view is withdrawn. It is never saved to localStorage. If you forgot the key, Cloudflare does not reveal an existing secret value: in Workers & Pages, open `gndec-compass` > Settings > Variables and Secrets, replace `ADMIN_API_TOKEN` with a new secret value, deploy the Worker update, and use that new value in KKJ. Keep it private. See [Cloudflare's secret setup guide](https://developers.cloudflare.com/workers/configuration/secrets/).

Imported PDF files are parsed on the admin's device; only structured records are published. Files are limited to three PDFs, 15 MB each, and 50 pages each. Selectable-text plans must use a recognized seating grid. The known EDG Shift 2 scan works only when its bytes match the recorded SHA-256; other image-only or ambiguous layouts require the reviewed CSV/manual workflow. Importing a local PDF does not upload it; provide an official GNDEC link when one exists.

## Storage and operational limits

The existing `SOURCE_REGISTRY` KV binding stores the current and previous exam publications at `gndec-compass:exam-publication:v1` and `:previous`. Records contain exact CRN seating assignments, but not student names, registration numbers or whole profiles. The public summary API omits assignments; a seating request sends one exact CRN and event ID to this same-origin Worker. This does not contact an inference API. The supplied reference PDFs themselves contain the source CRNs.

KV propagation is eventually consistent; changes can take 60 seconds or more to reach another location. The revision check prevents ordinary stale edits but is not a transaction or a concurrent-editor lock. See [Cloudflare's KV consistency documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/). Use one editor at a time.

Verified summaries are retained locally for offline use and labelled when a live check fails. An older summary cannot replace a newer one already seen by a device. Seating is rechecked against the current revision; unavailable or mismatched responses do not produce a guessed room. A KV failure prevents admin loading/publishing and fresh seat lookup; the bundled schedule can still be shown as a marked fallback.

The parser supports the supplied room-grid format, not arbitrary scanned PDFs. Untimed practical windows cannot establish an exact student lab date. Language support is bounded and deterministic; unfamiliar subject/details should produce clarification instead of fabricated facts.

## Verification

`npm test` includes PDF hash/count/row checks for all 2,292 assignments, the three new exam mappings, the scan fixture, three-file import, nine workshop scopes and equivalent wording, malformed publications, date expiry, safe profile switching, real DOM form submissions, the admin review/publish flow, stale revisions, rollback and failed HTML/KV responses. `npm run lint` and `npm run build` check all new modules and the Worker bundle. Actual behavior on an unidentified manufacturer's browser still needs a test on that device.

Release verification, 25 September 2026: 311 tests passed, including a two-PDF admin import test using both supplied plans and checks for duplicate, corrupt, excessive, and changed-during-read inputs; the two legacy stress suites and regression probes passed 119 checks; arithmetic fuzzing tested 20,012 inputs with no findings. The new tests also run every one of the 1,146 imported assignments through the seating API and 360 workshop wording/mode combinations. Failed live checks now discard cached seats; malformed or superseded seating responses are rejected, delayed responses cannot overwrite a different profile, and a failed multi-exam lookup stops instead of repeating timeouts.
