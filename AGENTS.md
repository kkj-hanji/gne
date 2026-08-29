# Repository instructions

- Preserve `legacyAnswerWithoutAi()` as the independent Compass fallback.
- Compass Brain must not depend on an LLM, neural embeddings, or an external inference API.
- Never fabricate timetable, teacher, room, profile, or syllabus facts.
- All personalized answers must use the active device profile and timetable selection.
- Uncertain, malformed, unverified, or failed Brain results must fall back safely.
- Keep deterministic plans bounded and browser-friendly.
- Preserve unrelated user changes and run `npm test` after relevant edits.
