# Withdrawn MSE-I date sheet

MSE-I date-sheet data have been removed from the active Compass app and its
bundled exam seeds. The app returns a clear missing-data response for MSE-I
date-sheet questions and does not use the archived rows as current facts.

The original user-supplied PDF and parsed seating records remain only under
`test/fixtures/exams/archive/` for historical source-integrity tests. They are
not in the website asset directory, bundled fallback, or public exam API.

The Worker filters MSE-I events and their seat assignments from the current and
previous `SOURCE_REGISTRY` publication. After the updated Worker is deployed,
the next exam API read rewrites both KV records without those events. If no
other exam events remain, the app serves an empty exam publication.
