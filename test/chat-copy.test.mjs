import test from "node:test";
import assert from "node:assert/strict";
import { formatDayScheduleCopy } from "../next/engine/chat-copy.js";

const html = `<p><strong>Tomorrow · CSD · CSD2</strong></p>
  <div class="answer-class"><div class="answer-class-time">9:30 AM – 10:30 AM</div><div class="answer-class-body"><strong>CHEMISTRY</strong><div class="answer-class-meta"><span class="tag">Lecture</span><span>DR AMANDEEP KAUR</span><span>A9 (AUTOMOBILE BLOCK)</span></div></div></div>
  <div class="answer-class"><div class="answer-class-time">11:30 AM – 12:30 PM</div><div class="answer-class-body"><strong>BASIC ELECTRICAL AND ELECTRONICS ENGINEERING</strong><div class="answer-class-meta"><span class="tag">Tutorial</span><span>ER. SWAPANDEEP KAUR (EE)</span><span>S204</span></div></div></div>
  <p class="answer-meta">Free bell slots: 8:30 AM–9:30 AM</p><p class="answer-source">Official GNDEC weekly timetable · release 07-09-2026.</p>`;

test("daily schedule copy uses the legacy heading and readable class blocks", () => {
  const copied = formatDayScheduleCopy({
    html,
    meta: { intent: "DAY_SCHEDULE", entities: { day: "Friday" } }
  }, {
    group: "CSE", subgroup: "CSE2", dateISO: "2026-11-12",
    schedule: [
      { group: "CSD", cohorts: "CSD2", day: "Friday", start: 570, subject: "CHEMISTRY", room: "A9 (AUTOMOBILE BLOCK)", teacher: "DR AMANDEEP KAUR" },
      { group: "CSD", cohorts: "CSD2", day: "Friday", start: 690, subject: "BASIC ELECTRICAL AND ELECTRONICS ENGINEERING", room: "S204", teacher: "ER. SWAPANDEEP KAUR (EE)" }
    ]
  });
  assert.equal(copied, "CSD2 timetable · Friday · 2026-11-13\n\nFriday 9:30 AM: CHEMISTRY\nA9 (AUTOMOBILE BLOCK) · DR AMANDEEP KAUR\n\nFriday 11:30 AM: BASIC ELECTRICAL AND ELECTRONICS ENGINEERING\nS204 · ER. SWAPANDEEP KAUR (EE)");
  assert.doesNotMatch(copied, /Lecture|Tutorial|Free bell slots|release/);
});

test("daily schedule copy refuses to invent a date or handle non daily answers", () => {
  assert.equal(formatDayScheduleCopy({ html, meta: { intent: "DAY_SCHEDULE", entities: { day: "Friday" } } }, { group: "CSD", subgroup: "CSD2" }), "");
  assert.equal(formatDayScheduleCopy({ html, meta: { intent: "NEXT_CLASS", entities: { day: "Friday" } } }, { group: "CSD", subgroup: "CSD2", dateISO: "2026-11-12" }), "");
});
