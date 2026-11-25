import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { chatQuestionToRetry, formatDayScheduleCopy, formatChatMessageCopy, htmlToChatText, writeChatClipboard } from "../next/engine/chat-copy.js";

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

test("general answer copy preserves paragraphs, choices, tables, labels and source links", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const answerHtml = `<p><strong>Programming Fundamentals using Python · ESC105</strong></p>
    <p>Choose a verified option:</p><ul><li>Semester 2 syllabus</li><li>Course marks</li></ul>
    <dl><div><dt>Credits</dt><dd>3</dd></div><div><dt>Course type</dt><dd>Core</dd></div></dl>
    <table><tr><th>Assessment</th><th>Maximum</th></tr><tr><td>End semester</td><td>60 marks</td></tr></table>
    <p>Official source: <a href="https://college.example/syllabus.pdf">Open the PDF</a>.</p>
    <div class="answer-suggestions"><button>Internal option</button></div><button>Copy</button>`;
  const copied = formatChatMessageCopy({ html: answerHtml }, {}, document);
  assert.match(copied, /Programming Fundamentals using Python · ESC105\n\nChoose a verified option:/);
  assert.match(copied, /• Semester 2 syllabus\n• Course marks/);
  assert.match(copied, /Credits: 3\nCourse type: Core/);
  assert.match(copied, /Assessment\tMaximum\nEnd semester\t60 marks/);
  assert.match(copied, /Open the PDF \(https:\/\/college\.example\/syllabus\.pdf\)/);
  assert.doesNotMatch(copied, /Internal option|\nCopy\n|<p>/);
});

test("chat HTML is decoded safely and retains readable line breaks", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  assert.equal(htmlToChatText("<p>A &amp; B</p><p>Next<br>line</p>", document), "A & B\n\nNext\nline");
  assert.equal(htmlToChatText("<p>Answer</p><script>secret()</script><style>.x{}</style>", document), "Answer");
  assert.equal(htmlToChatText("A &#x110000; B", null), "A � B");
});

test("Ask again from an answer retries its user's prompt, including after selectable followups", () => {
  const chat = [
    { role: "user", html: "<p>math 2</p>" },
    { role: "assistant", html: "<p>Choose Mathematics-II or Mathematics-I.</p>" },
    { role: "user", html: "<p>Mathematics-II syllabus</p>" },
    { role: "assistant", html: "<p>Verified syllabus</p>" }
  ];
  assert.equal(chatQuestionToRetry(chat, 3), chat[2]);
  assert.equal(chatQuestionToRetry(chat, 1), chat[0]);
  assert.equal(chatQuestionToRetry(chat, 2), chat[2]);
  assert.equal(chatQuestionToRetry(chat, 0), chat[0]);
  assert.equal(chatQuestionToRetry(chat, 9), null);
});

test("clipboard writer uses Clipboard API and falls back to a temporary textarea", async () => {
  const { document } = parseHTML("<!doctype html><html><body><button>active</button></body></html>");
  const writes = [];
  await writeChatClipboard("Readable answer\n\n• Choice", {
    clipboard: { writeText: async (text) => writes.push(text) }, documentRef: document
  });
  assert.deepEqual(writes, ["Readable answer\n\n• Choice"]);

  const createElement = document.createElement.bind(document);
  document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === "textarea") element.select = () => {};
    return element;
  };
  document.execCommand = (command) => command === "copy";
  await writeChatClipboard("Fallback answer", { clipboard: null, documentRef: document });
  assert.equal(document.querySelector("textarea"), null);
  assert.equal(document.querySelectorAll("body > *").length, 1);
});
