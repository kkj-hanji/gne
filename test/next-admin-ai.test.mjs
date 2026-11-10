import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/next-core.js";

const ORIGIN = "https://next.compass.test";
const DEVICE = "nx-abcdefghijklmnop";
const PROFILE = {
  name: "Kaushik Jain", crn: "2617070", registrationNo: "26011000",
  branch: "EC", section: "ECB", subsection: "ECB1"
};
const SELECTION = { group: "ECB", subgroup: "ECB1" };

function memoryKv() {
  const rows = new Map();
  return {
    rows,
    async get(key, type) {
      const value = rows.get(key);
      return type === "json" && value ? JSON.parse(value) : value || null;
    },
    async put(key, value) { rows.set(key, String(value)); }
  };
}

function request(path, { profile = PROFILE, selection = SELECTION, ip = "203.0.113.8", device = DEVICE } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
      "X-Compass-Device": device
    },
    body: JSON.stringify({ profile, selection })
  });
}

test("KKJ enrollment checks the owner profile and stores only device, IP and profile hashes", async () => {
  const CONTENT = memoryKv();
  let legacyCalls = 0;
  const env = { CONTENT, LEGACY_ORIGIN: "https://legacy.compass.test" };
  const deps = {
    cache: null,
    fetch: async (url, init) => {
      legacyCalls += 1;
      assert.equal(url, "https://legacy.compass.test/api/admin/ai/unlock");
      assert.equal(init.headers.get("X-Compass-Device"), DEVICE);
      assert.equal(init.headers.get("CF-Connecting-IP"), "203.0.113.8");
      return Response.json({ ok: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
    }
  };
  const wrongProfile = await handleRequest(request("/api/admin/ai/unlock", { profile: { ...PROFILE, crn: "123" } }), env, {}, deps);
  assert.equal(wrongProfile.status, 403);
  assert.equal(legacyCalls, 0);

  const enrolled = await handleRequest(request("/api/admin/ai/unlock"), env, {}, deps);
  assert.equal(enrolled.status, 200);
  const enrollment = await enrolled.json();
  assert.equal(enrollment.ok, true);
  assert.equal(legacyCalls, 1);
  const [key, record] = [...CONTENT.rows.entries()][0];
  assert.match(key, /^gndec-next:admin-ai:[a-f0-9]{64}$/);
  assert.doesNotMatch(record, /Kaushik|2617070|26011000|ECB1/);

  const active = await handleRequest(request("/api/admin/ai/status"), env, {}, deps);
  assert.equal((await active.json()).active, true);
  const changedNetwork = await handleRequest(request("/api/admin/ai/status", { ip: "203.0.113.9" }), env, {}, deps);
  assert.equal((await changedNetwork.json()).active, false);
  const changedSelection = await handleRequest(request("/api/admin/ai/status", { selection: { group: "ECB", subgroup: "ECB2" } }), env, {}, deps);
  assert.equal(changedSelection.status, 403);
});

test("chat relay strips an unverified admin profile before it reaches the legacy AI relay", async () => {
  const CONTENT = memoryKv();
  let sentBody;
  const payload = { question: "hello", adminProfile: PROFILE, selection: SELECTION, stream: true };
  const response = await handleRequest(new Request(`${ORIGIN}/api/legacy/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.8", "X-Compass-Device": DEVICE },
    body: JSON.stringify(payload)
  }), { CONTENT, LEGACY_ORIGIN: "https://legacy.compass.test" }, {}, {
    cache: null,
    fetch: async (_url, init) => {
      sentBody = JSON.parse(typeof init.body === "string" ? init.body : await new Response(init.body).text());
      return new Response("data: {\"delta\":\"ok\"}\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }
  });
  assert.equal(response.status, 200);
  assert.equal(sentBody.question, "hello");
  assert.equal("adminProfile" in sentBody, false);
  assert.equal("selection" in sentBody, false);
});

test("chat relay passes the owner profile only when the server-bound device, profile, and network session is active", async () => {
  const CONTENT = memoryKv();
  const env = { CONTENT, LEGACY_ORIGIN: "https://legacy.compass.test" };
  const deps = {
    cache: null,
    fetch: async (url, init) => {
      if (url.endsWith("/api/admin/ai/unlock")) {
        assert.equal(init.headers.get("CF-Connecting-IP"), "203.0.113.8");
        return Response.json({ ok: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
      }
      return new Response("data: {\"delta\":\"ok\"}\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }
  };
  const enrolled = await handleRequest(request("/api/admin/ai/unlock"), env, {}, deps);
  assert.equal(enrolled.status, 200);

  let sentBody;
  let chatIp;
  const chat = await handleRequest(new Request(`${ORIGIN}/api/legacy/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.8", "X-Compass-Device": DEVICE },
    body: JSON.stringify({ question: "hello", adminProfile: PROFILE, selection: SELECTION, stream: true })
  }), env, {}, {
    ...deps,
    fetch: async (url, init) => {
      if (url.endsWith("/api/admin/ai/unlock")) return deps.fetch(url, init);
      chatIp = init.headers.get("CF-Connecting-IP");
      sentBody = JSON.parse(init.body);
      return deps.fetch(url, init);
    }
  });
  assert.equal(chat.status, 200);
  assert.equal(chatIp, "203.0.113.8");
  assert.deepEqual(sentBody.adminProfile, PROFILE);
  assert.deepEqual(sentBody.selection, SELECTION);
});
