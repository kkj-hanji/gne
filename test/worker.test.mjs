import assert from "node:assert/strict";
import test from "node:test";
import worker, { parseFacultyDirectoryHtml, parseFacultyProfileHtml } from "../src/worker.js";

const ids = ["groups", "subgroups", "teachers", "rooms", "subjects", "years"];
const labels = {
  groups: "Section wise Time Table", subgroups: "Sub-section wise Time Table", teachers: "Faculty Time Table",
  rooms: "Room Time Table", subjects: "Subject wise Time Table", years: "Program wise Time Table"
};
const sourceUrl = (id) => `https://appsc.gndec.ac.in/sites/default/files/2099-01/current_${id}.html`;
const bundledSourceUrl = (stamp, id) => `https://appsc.gndec.ac.in/sites/default/files/2099-01/${stamp}_FINAL_FILE_R4_${id}_days_horizontal.html`;
const fet = (marker) => `<!doctype html><table><thead><tr><th class="xAxis">Monday</th><th class="xAxis">Tuesday</th><th class="xAxis">Wednesday</th><th class="xAxis">Thursday</th><th class="xAxis">Friday</th></tr></thead><tbody><tr class="studentsset"><td>${marker}</td></tr><tr><th class="yAxis">08:30</th><td>Class</td></tr></tbody></table><p>Timetable generated with FET 7.6.4 on 8/12/26 6:47 AM</p>`;
const bundledIndex = () => `<h3>Revised Time Table w.e.f. 24-08-2026</h3>${["09_08_2026", "23_08_2026"].flatMap((stamp) => ids.map((id) => `<a href="${bundledSourceUrl(stamp, id)}">${labels[id]}</a>`)).join("")}<a href="/sites/default/files/2026-08/EC%20Permanent%20Sections%202026.pdf">EC Branch Students</a>`;
const index = () => `<h3>Time Table w.e.f. 01-01-2099</h3>${ids.map((id) => `<a href="${sourceUrl(id)}">${labels[id]}</a>`).join("")}<a href="/sites/default/files/2099-01/CS%20Students.pdf">👥 CS Branch Students</a><a href="/sites/default/files/2098-08/CS%20old%20students%20sections.pdf">CS Branch Students</a><a href="/sites/default/files/2099-01/one-day-activity-schedule.pdf">One-day activity schedule</a>`;

class MemoryKv {
  values = new Map();
  async get(key, type) { const value = this.values.get(key) || null; return type === "json" && value ? JSON.parse(value) : value; }
  async put(key, value) { this.values.set(key, value); }
}

test("official faculty parsers keep professional fields and exclude personal birth data", () => {
  const directoryHtml = `<table><tr><th>Name</th></tr><tr><td>DR. CHAHAT JAIN</td><td>Assistant Professor</td><td>chahatjain@gndec.ac.in</td><td><a href="http://gndec.ac.in/faculty/?id=126">View</a></td><td><a href="https://vidwan.inflibnet.ac.in/profile/158805">Link</a></td></tr></table>`;
  const records = parseFacultyDirectoryHtml(directoryHtml, 17, "Electronics & Communication Engineering");
  assert.equal(records.length, 1);
  assert.equal(records[0].profileId, "126");
  assert.equal(records[0].profileUrl, "https://gndec.ac.in/faculty/?id=126");
  const profileHtml = `<table><tr><th>Photo</th><td><img src="/images/photo.jpg"></td></tr><tr><th>Name</th><td>DR. CHAHAT JAIN</td></tr><tr><th>Date of Birth</th><td>26.12.1987</td></tr><tr><th>Experience</th><td>15 years</td></tr><tr><th>Qualification</th><td><ul><li>Ph.D (ECE)</li><li>M.Tech (ECE)</li></ul></td></tr><tr><th>No. of Publications (Journal):</th><td>18</td></tr><tr><th>Research Interest</th><td>Antenna design</td></tr></table>`;
  const profile = parseFacultyProfileHtml(profileHtml, "126");
  assert.deepEqual(profile.qualifications, ["Ph.D (ECE)", "M.Tech (ECE)"]);
  assert.equal(profile.experience, "15 years");
  assert.equal(profile.journalPublications, "18");
  assert.equal(profile.researchInterests, "Antenna design");
  assert.equal(profile.photoUrl, "https://gndec.ac.in/images/photo.jpg");
  assert.equal("dateOfBirth" in profile, false);
  assert.doesNotMatch(JSON.stringify(profile), /26\.12\.1987/);
  assert.equal(parseFacultyProfileHtml(`<table><tr><th>Photo</th><td><img src="https://tracker.example/photo.jpg"></td></tr></table>`, "126").photoUrl, undefined);
});

test("faculty photo proxy accepts Sanjam Kaur Sidhu's verified 13.3 MB image while retaining a bounded limit", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const pending = [];
  let photoLength = 13_269_239;
  globalThis.caches = { default: { match: async () => null, put: async () => {} } };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://gndec.ac.in/faculty/?id=")) {
      return new Response(`<table><tr><th>Photo</th><td><img src="/images/IMG_9104.JPG"></td></tr><tr><th>Name</th><td>SANJAM KAUR SIDHU</td></tr></table>`);
    }
    if (url === "https://gndec.ac.in/images/IMG_9104.JPG") {
      return new Response(new Uint8Array([255, 216, 255, 217]), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(photoLength) } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const accepted = await worker.fetch(new Request("https://compass.test/api/faculty/photo?id=470"), {}, { waitUntil: (promise) => pending.push(promise) });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get("content-type"), "image/jpeg");
    await Promise.all(pending);

    photoLength = 16_000_001;
    const rejected = await worker.fetch(new Request("https://compass.test/api/faculty/photo?id=471"), {}, { waitUntil() {} });
    assert.equal(rejected.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test("latest bootstrap release falls back to the previous verified timetable without caching it", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const requested = [];
  globalThis.caches = { default: { match: async () => null, put: async () => { throw new Error("A fallback must not be cached"); } } };
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("30_08_2026%20FINAL_FILE_subgroups")) return new Response("Unavailable", { status: 503 });
    if (url.includes("09_08_2026%20FINAL_FILE%20R4_subgroups")) return new Response(fet("previous-verified"), { status: 200 });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const response = await worker.fetch(new Request("https://compass.test/api/timetable?source=subgroups"), {}, { waitUntil() {} });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-GNDEC-Fallback"), "previous-verified");
    assert.equal(response.headers.get("X-GNDEC-Version"), "09-08-2026 (previous verified fallback)");
    assert.equal(response.headers.get("X-GNDEC-Source-Footer"), "FET 7.6.4 · 8/13/26 9:12 AM");
    assert.match(await response.text(), /previous-verified/);
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  }
});

test("scheduled discovery validates and promotes a complete new GNDEC source registry", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new MemoryKv();
  let marker = "first";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://appsc.gndec.ac.in/time_tables") return new Response(index(), { status: 200 });
    if (url === "https://www.gndec.ac.in/?q=node/23") return new Response('<a href="/sites/default/files/acjul-dec26.pdf">Academic Calendar for Jul 2026 - Dec 2026</a><a href="/sites/default/files/acjan-jun26.pdf">Academic Calendar Jan-Jun 2026</a>', { status: 200 });
    if (url === "https://www.gndec.ac.in/sites/default/files/acjul-dec26.pdf") return new Response(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, ...Array(300).fill(0)]), { status: 200 });
    if (url.endsWith("CS%20Students.pdf") || url.includes("Permanent%20Sections%202026") || url.includes("Branch%20Temporary%20Sections%202026_0.pdf")) return new Response(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, ...Array(300).fill(0)]), { status: 200 });
    if (ids.some((id) => url === sourceUrl(id))) return new Response(fet(marker), { status: 200 });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const pending = [];
    await worker.scheduled({}, { SOURCE_REGISTRY: kv }, { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
    const first = JSON.parse(kv.values.get("gndec-compass:active-source-registry:v1"));
    assert.equal(first.mode, "automatic");
    assert.equal(first.version, "01-01-2099");
    assert.equal(first.sources.groups.url, sourceUrl("groups"));
    assert.equal(first.sources.groups.verified, true);
    assert.equal(first.studentSectionSources.CS.verified, true);
    assert.deepEqual(Object.keys(first.studentSectionSources).sort(), ["CE", "CS", "EC", "EE", "IT", "ME", "RAI"]);
    assert.equal(first.studentHistorySources.EC[0].verified, true);
    assert.equal(first.studentHistorySources.EC[0].version, "11-08-2026");
    assert.equal(first.academicCalendarSource.url, "https://www.gndec.ac.in/sites/default/files/acjul-dec26.pdf");
    assert.equal(first.academicCalendarSource.verified, true);
    assert.deepEqual(first.extraLinks, [{ label: "One-day activity schedule", url: "https://appsc.gndec.ac.in/sites/default/files/2099-01/one-day-activity-schedule.pdf" }]);
    const sourceResponse = await worker.fetch(new Request("https://compass.test/api/sources"), { SOURCE_REGISTRY: kv }, { waitUntil() {} });
    const publicSources = await sourceResponse.json();
    assert.equal(publicSources.sources.find((source) => source.id === "groups").contentHash, first.sources.groups.hash);
    assert.equal(publicSources.sources.find((source) => source.id === "groups").sourceFooter, "FET 7.6.4 · 8/12/26 6:47 AM");
    assert.equal(publicSources.studentSectionSources.find((source) => source.branch === "CS").contentHash, first.studentSectionSources.CS.hash);
    assert.equal(publicSources.studentHistorySources.find((source) => source.branch === "EC").contentHash, first.studentHistorySources.EC[0].hash);

    marker = "same-url-new-content";
    const refreshedResponse = await worker.fetch(new Request("https://compass.test/api/sources?refresh=1"), { SOURCE_REGISTRY: kv }, { waitUntil() {} });
    const refreshedSources = await refreshedResponse.json();
    assert.notEqual(refreshedSources.sources.find((source) => source.id === "groups").contentHash, first.sources.groups.hash);
    const secondPending = [];
    await worker.scheduled({}, { SOURCE_REGISTRY: kv }, { waitUntil: (promise) => secondPending.push(promise) });
    await Promise.all(secondPending);
    const second = JSON.parse(kv.values.get("gndec-compass:active-source-registry:v1"));
    assert.notEqual(second.sources.groups.hash, first.sources.groups.hash);
    assert.equal(second.sources.groups.url, first.sources.groups.url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discovery selects the newest complete dated timetable bundle instead of page order", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new MemoryKv();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://appsc.gndec.ac.in/time_tables") return new Response(bundledIndex(), { status: 200 });
    if (url.includes("Permanent%20Sections%202026") || url.includes("Branch%20Temporary%20Sections%202026_0.pdf")) return new Response(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, ...Array(300).fill(0)]), { status: 200 });
    if (ids.some((id) => url === bundledSourceUrl("09_08_2026", id))) return new Response(fet("old"), { status: 200 });
    if (ids.some((id) => url === bundledSourceUrl("23_08_2026", id))) return new Response(fet("new"), { status: 200 });
    throw new Error(`Unexpected fetch ${url}`);
  };
  try {
    const pending = [];
    await worker.scheduled({}, { SOURCE_REGISTRY: kv }, { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
    const registry = JSON.parse(kv.values.get("gndec-compass:active-source-registry:v1"));
    assert.equal(registry.version, "24-08-2026");
    ids.forEach((id) => assert.equal(registry.sources[id].url, bundledSourceUrl("23_08_2026", id)));
    assert.equal(registry.studentSectionSources.EC.url, "https://appsc.gndec.ac.in/sites/default/files/2026-08/EC%20Permanent%20Sections%202026.pdf");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI proxy strips student identifiers and private roster fields before external inference", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new MemoryKv();
  let forwarded = null;
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== "https://integrate.api.nvidia.com/v1/chat/completions") throw new Error(`Unexpected fetch ${input}`);
    forwarded = JSON.parse(init.body);
    return Response.json({ choices: [{ message: { content: "Safe answer" } }] });
  };
  try {
    const request = new Request("https://compass.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": "d3e5c6a4-abc1-4567-9876-111111111111", "CF-Connecting-IP": "203.0.113.50" },
      body: JSON.stringify({
        question: "Make a plan for Test Student, CRN A9X771, registration 26019999, mentor phone 9999999999",
        context: { studentProfile: { name: "Test Student", crn: "A9X771", registrationNo: "26019999", serialNo: "68", mentor: "DR PRIVATE", mentorPhone: "9999999999", branch: "EC", section: "ECB" }, selectedTimetable: { weeklyClasses: [{ subject: "PHYSICS", teacher: "DR VERIFIED", room: "A6" }] } },
        adminProfile: { name: "Test Student", crn: "A9X771", registrationNo: "26019999", serialNo: "68", mentor: "DR PRIVATE", mentorPhone: "9999999999" }
      })
    });
    const response = await worker.fetch(request, { SOURCE_REGISTRY: kv, MY_NVIDIA_API_KEY: "test-key" }, { waitUntil() {} });
    assert.equal(response.status, 200);
    assert.ok(forwarded);
    const externalPayload = JSON.stringify(forwarded.messages);
    ["Test Student", "A9X771", "26019999", "DR PRIVATE", "9999999999", "serialNo", "mentorPhone"].forEach((secret) => assert.doesNotMatch(externalPayload, new RegExp(secret, "i")));
    assert.match(externalPayload, /DR VERIFIED/);
    assert.match(externalPayload, /private value removed|identifier removed/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streaming AI falls back after a pre-answer GPT timeout and keeps verified catalogue context", async () => {
  const originalFetch = globalThis.fetch;
  const kv = new MemoryKv();
  const attemptedModels = [];
  let musePayload = null;
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== "https://integrate.api.nvidia.com/v1/chat/completions") throw new Error(`Unexpected fetch ${input}`);
    const payload = JSON.parse(init.body);
    attemptedModels.push(payload.model);
    if (payload.model === "openai/gpt-oss-120b") throw new DOMException("Model timed out", "TimeoutError");
    musePayload = payload;
    const upstream = 'data: {"choices":[{"delta":{"content":"GNDEC has 7 engineering branches."}}]}\n\ndata: [DONE]\n\n';
    return new Response(upstream, { headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const request = new Request("https://compass.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Compass-Device": "d3e5c6a4-abc1-4567-9876-111111111111", "CF-Connecting-IP": "203.0.113.51" },
      body: JSON.stringify({
        question: "how many brances do we have",
        heavy: true,
        stream: true,
        context: { officialAcademicCatalogue: { engineeringBranchCount: 7, engineeringBranches: ["CE", "CS", "EC", "EE", "IT", "ME", "RAI"] } }
      })
    });
    const response = await worker.fetch(request, { SOURCE_REGISTRY: kv, MY_NVIDIA_API_KEY: "test-key" }, { waitUntil() {} });
    assert.equal(response.status, 200);
    const streamText = await response.text();
    assert.deepEqual(attemptedModels, ["openai/gpt-oss-120b", "meta/muse-glimmer-30b"]);
    assert.match(streamText, /meta\/muse-glimmer-30b/);
    assert.match(streamText, /GNDEC has 7 engineering branches/);
    assert.match(musePayload.messages[1].content, /engineeringBranchCount[^0-9]{1,4}7/);
    assert.match(musePayload.messages[0].content, /directly contains the answer/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hard-coded Kaushik ECB1 KKJ enrollment saves only a hashed device/IP admin record", async () => {
  const kv = new MemoryKv();
  const rejected = await worker.fetch(new Request("https://compass.test/api/admin/ai/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Compass-Device": "d3e5c6a4-abc1-4567-9876-111111111111", "CF-Connecting-IP": "203.0.113.50" },
    body: JSON.stringify({ profile: { name: "Kaushik Jain", crn: "CHANGED", branch: "EC", section: "ECB", subsection: "ECB1" } })
  }), { SOURCE_REGISTRY: kv }, { waitUntil() {} });
  assert.equal(rejected.status, 403);
  assert.equal([...kv.values.keys()].some((key) => key.startsWith("gndec-compass:ai-admin:")), false);
  const request = new Request("https://compass.test/api/admin/ai/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Compass-Device": "d3e5c6a4-abc1-4567-9876-111111111111", "CF-Connecting-IP": "203.0.113.50" },
    body: JSON.stringify({ profile: { name: "  KAUSHIK   jain ", crn: "2617070", branch: "EC", section: "ecb", subsection: "ecb1" } })
  });
  const response = await worker.fetch(request, { SOURCE_REGISTRY: kv }, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /"ok":true/);
  const stored = [...kv.values.entries()].find(([key]) => key.startsWith("gndec-compass:ai-admin:"));
  assert.ok(stored);
  assert.doesNotMatch(stored[0], /kaushik|203\.0\.113/);
  assert.doesNotMatch(stored[1], /kaushik|203\.0\.113/);
});

test("admin API token is required and accepts the owner's casing variants", async () => {
  const endpoint = "https://compass.test/api/admin/ai/roster-qa";
  for (const suppliedToken of ["kkj", "Kkj", "KKJ"]) {
    const response = await worker.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${suppliedToken}` }
    }), { ADMIN_API_TOKEN: "kkj" }, { waitUntil() {} });
    assert.equal(response.status, 200, suppliedToken);
  }
  const missingSecret = await worker.fetch(new Request(endpoint, { method: "POST", headers: { "Authorization": "Bearer kkj" } }), {}, { waitUntil() {} });
  assert.equal(missingSecret.status, 401);
  const wrongToken = await worker.fetch(new Request(endpoint, { method: "POST", headers: { "X-Compass-Admin-Key": "not-kkj" } }), { ADMIN_API_TOKEN: "kkj" }, { waitUntil() {} });
  assert.equal(wrongToken.status, 401);
});
