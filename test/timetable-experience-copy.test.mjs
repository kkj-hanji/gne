import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

const html = await readFile("public/index.html", "utf8");
const source = (await readFile("public/app.js", "utf8")).replace(/restoreData\(\);[\s\S]*?(?=function kbClean)/, "");
function harness() {
  const { document, window } = parseHTML(html);
  for (const select of document.querySelectorAll("select")) Object.defineProperty(select, "value", { writable: true, value: "" });
  const storage = new Map();
  const clipboard = [];
  const navigator = { clipboard: { writeText: async text => { clipboard.push(text); } } };
  const context = vm.createContext({ document, console, Date, Intl, URL, navigator,
    window: { setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    location: { hash: "#timetable", search: "", href: "http://localhost/#timetable" },
    fetch() { throw new Error("Views and copy must not fetch data"); }
  });
  vm.runInContext(source, context);
  vm.runInContext(`
    globalThis.api = {state, buildScheduleIndex, renderWeek, saveSettings, loadSettings, ensureChatBubble, persistChat, restoreChat, chatCopyText, copyChatBubble};
    state.nowOverride = "2026-09-16T04:00:00Z";
    state.groups = ["ECB"];
    state.selectedGroup = "ECB"; state.selectedSubgroup = "ECB1";
    state.schedule = [
      {id:"one",group:"ECB",cohorts:"ECB1",day:"Wednesday",start:570,end:690,subject:"OWN LAB",teacher:"TEACHER A",room:"G6",type:"P"},
      {id:"two",group:"ECB",cohorts:"ECB2",day:"Wednesday",start:570,end:630,subject:"OTHER LAB",teacher:"TEACHER B",room:"G7",type:"P"},
      {id:"shared",group:"ECB",cohorts:"ECB",day:"Monday",start:630,end:690,subject:"SHARED TUTORIAL",teacher:"TEACHER C",room:"F1",type:"T"}
    ];
    buildScheduleIndex(); hydrateGroupControls(); initEvents(); renderWeek();
  `, context);
  const get = id => document.getElementById(id);
  const change = (id, value) => { get(id).value = value; get(id).dispatchEvent(new window.Event("change", { bubbles: true })); };
  return { document, window, api: context.api, storage, clipboard, navigator, get, change };
}

test("optional views persist while existing grid, transposed and list choices survive", () => {
  const { api, get, change } = harness();
  assert.equal(api.state.settings.timetableExperience, "classic");
  assert.ok(get("week-table").querySelector(".week-grid"));
  assert.equal(get("timetable-view-controls").hidden, true);
  api.saveSettings({ timetableSwapAxes: true });
  assert.ok(get("week-table").querySelector(".transposed-grid"));
  change("settings-timetable-experience", "list");
  assert.equal(api.loadSettings().timetableExperience, "list");
  assert.equal(get("timetable-view-controls").hidden, false);
  assert.equal(get("week-table").querySelectorAll(".tt-agenda section").length, 5);
  assert.match(get("week-table").textContent, /OWN LAB/);
  assert.match(get("week-table").textContent, /SHARED TUTORIAL/);
  assert.doesNotMatch(get("week-table").textContent, /OTHER LAB/);
  assert.equal(api.state.settings.timetableSwapAxes, true);
  change("settings-timetable-experience", "classic");
  assert.ok(get("week-table").querySelector(".transposed-grid"));
  assert.equal(get("week-table").classList.contains("timetable-modern"), false);
  api.saveSettings({ timetableGridView: false });
  assert.ok(get("week-table").querySelector(".week-list"));
});

test("day and week controls use India day, selected subgroup, details and continuation slots", () => {
  const { api, get, change, document, window } = harness();
  change("settings-timetable-experience", "day");
  assert.equal(get("timetable-view-day").value, "Wednesday");
  assert.match(get("week-table").textContent, /OWN LAB/);
  assert.doesNotMatch(get("week-table").textContent, /SHARED TUTORIAL|OTHER LAB/);
  const details = get("week-table").querySelector("details");
  assert.ok(details.querySelector("summary"));
  assert.match(details.textContent, /G6.*Practical\/Lab \(P\).*TEACHER A.*ECB1.*120 minutes/s);
  change("timetable-view-day", "Saturday");
  assert.match(get("week-table").textContent, /Saturday.*No class listed/s);
  assert.doesNotMatch(get("week-table").textContent, /holiday|college closed/i);
  document.querySelector('[data-timetable-view="week"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(get("settings-timetable-experience").value, "week");
  assert.equal(get("timetable-scroll-hint").hidden, false);
  assert.equal(get("week-table").querySelectorAll('thead th[scope="col"]').length, 6);
  assert.match(get("week-table").textContent, /Continues/);
  assert.doesNotMatch(get("week-table").textContent, /OTHER LAB/);
  api.state.selectedSubgroup = "ECB2"; api.renderWeek();
  assert.match(get("week-table").textContent, /OTHER LAB/);
  assert.doesNotMatch(get("week-table").textContent, /OWN LAB/);
});

test("empty schedules and invalid saved view fail safely without replacing original settings", () => {
  const { api, get, change } = harness();
  api.state.schedule = []; api.buildScheduleIndex();
  // Rebuild using the application rather than relying on its index representation.
  api.state.groups = []; api.state.selectedGroup = ""; get("timetable-group").value = "";
  change("settings-timetable-experience", "day");
  assert.match(get("week-table").textContent, /No class listed/);
  change("settings-timetable-experience", "unknown");
  assert.equal(get("timetable-view-controls").hidden, true);
  assert.equal(get("settings-timetable-experience").value, "classic");
});

test("answer copy includes timetable, uncertainty and date, excludes controls and suggestions", async () => {
  const { api, clipboard } = harness();
  const answer = api.ensureChatBubble("assistant", '<p><strong>Wednesday · 16 Sept 2026</strong></p><p><strong>9:30 AM:</strong> Physics<br>G6 · Teacher A</p><p class="answer-warning">Room availability is not confirmed.</p><p class="answer-source">Official GNDEC weekly timetable.</p><p class="answer-source">Snapshot checked 16 Sept 2026; appointments can change.</p><p class="answer-model">Internal model</p><div class="kb-followups">Try next<button>Next lecture?</button></div>');
  await api.copyChatBubble(answer.querySelector(".chat-copy"));
  assert.match(clipboard[0], /Wednesday · 16 Sept 2026\n\n9:30 AM: Physics\nG6 · Teacher A/);
  assert.match(clipboard[0], /Room availability is not confirmed/);
  assert.match(clipboard[0], /Snapshot checked 16 Sept/);
  assert.doesNotMatch(clipboard[0], /Try next|Next lecture|Internal model|Official GNDEC weekly timetable|<p>/);
});

test("question copy, asynchronous answer replacement, and restored chat keep one working button", async () => {
  const { api, clipboard, document, window, get, storage } = harness();
  const question = api.ensureChatBubble("user", "Aaj timetable &amp; kal holiday?");
  question.querySelector(".chat-copy svg").dispatchEvent(new window.Event("click", { bubbles: true }));
  await Promise.resolve();
  assert.equal(clipboard[0], "Aaj timetable & kal holiday?");
  const answer = api.ensureChatBubble("assistant thinking", "Thinking…");
  assert.equal(answer.querySelector(".chat-copy"), null);
  answer.className = "chat-bubble assistant"; answer.innerHTML = "<p>Answer ready</p>";
  api.persistChat(); api.persistChat();
  assert.equal(answer.querySelectorAll(".chat-copy").length, 1);
  const stored = [...storage.values()].find(value => value.includes("Answer ready"));
  assert.ok(stored); assert.doesNotMatch(stored, /chat-copy|<svg/);
  get("chat-window").innerHTML = ""; api.restoreChat();
  assert.equal(document.querySelectorAll(".chat-copy").length, 2);
  await api.copyChatBubble(document.querySelector(".assistant .chat-copy"));
  assert.equal(clipboard.at(-1), "Answer ready");
});

test("clipboard denial reports failure; supported fallback copies and cleans up", async () => {
  const { api, navigator, document, get } = harness();
  navigator.clipboard.writeText = async () => { throw new Error("Permission denied"); };
  const bubble = api.ensureChatBubble("assistant", "<p>Physics</p>");
  await api.copyChatBubble(bubble.querySelector(".chat-copy"));
  assert.match(get("toast").textContent, /blocked/);
  assert.equal(document.querySelector(".chat-copy-buffer"), null);
  const create = document.createElement.bind(document);
  document.createElement = name => { const element = create(name); if (name === "textarea") element.select = () => {}; return element; };
  document.execCommand = command => command === "copy";
  await api.copyChatBubble(bubble.querySelector(".chat-copy"));
  assert.equal(get("toast").textContent, "Main answer copied");
  assert.equal(document.querySelector(".chat-copy-buffer"), null);
});
