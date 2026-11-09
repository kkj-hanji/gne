import test from "node:test";
import assert from "node:assert/strict";

import {
  APP_NAME, APP_VERSION, DEFAULT_LEGACY_ORIGIN, handleRequest, versionPayload
} from "../src/next-core.js";

const ORIGIN = "https://next.compass.test";

function request(path, options = {}) {
  return new Request(`${ORIGIN}${path}`, options);
}

function env(overrides = {}) {
  return {
    LEGACY_ORIGIN: "https://legacy.compass.test",
    APP_VERSION,
    APP_CHANNEL: "stable",
    ...overrides
  };
}

function ctx() {
  const pending = [];
  return { pending, waitUntil(promise) { pending.push(promise); } };
}

function response(body = "{}", { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

/* ── health and version ────────────────────────────────────────────────── */

test("health reports the app and the legacy origin without secrets", async () => {
  const res = await handleRequest(request("/api/health"), env(), ctx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.app, APP_NAME);
  assert.equal(body.version, APP_VERSION);
  assert.equal(body.legacy, "https://legacy.compass.test");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("X-Frame-Options"), "DENY");
  assert.match(res.headers.get("Content-Security-Policy"), /default-src 'self'/);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("version describes the engine and privacy posture", async () => {
  const payload = versionPayload(env());
  assert.equal(payload.app.name, APP_NAME);
  assert.equal(payload.app.version, APP_VERSION);
  assert.equal(payload.app.channel, "stable");
  assert.equal(payload.app.schema, 3);
  assert.equal(payload.legacy.url, "https://legacy.compass.test");
  assert.equal(payload.legacy.frozen, true);
  assert.equal(payload.engine.local, true);
  assert.deepEqual(payload.engine.brain, ["2.2", "1.2", "2.0"]);
  assert.match(payload.engine.externalAi, /never used for timetable facts/);
  assert.equal(payload.privacy.analytics, "off by default");

  const res = await handleRequest(request("/api/version"), env(), ctx());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control"), /max-age=120/);
  assert.deepEqual(await res.json(), payload);
});

test("the legacy origin is validated and cannot be redirected to plain HTTP", () => {
  assert.equal(versionPayload({ LEGACY_ORIGIN: "http://evil.test" }).legacy.url, DEFAULT_LEGACY_ORIGIN);
  assert.equal(versionPayload({ LEGACY_ORIGIN: "not a url" }).legacy.url, DEFAULT_LEGACY_ORIGIN);
  assert.equal(versionPayload({ LEGACY_ORIGIN: "https://legacy.test/deep/path?q=1" }).legacy.url, "https://legacy.test");
  assert.equal(versionPayload({}).legacy.url, DEFAULT_LEGACY_ORIGIN);
});

/* ── proxy allow-list ──────────────────────────────────────────────────── */

test("the proxy forwards only allow-listed public paths", async () => {
  const calls = [];
  const deps = {
    cache: null,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return response("<html>official timetable</html>", { headers: { "Content-Type": "text/html" } });
    }
  };

  const res = await handleRequest(request("/api/legacy/api/timetable?source=groups"), env(), ctx(), deps);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<html>official timetable</html>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://legacy.compass.test/api/timetable?source=groups");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.get("X-Compass-Next"), "1");
  assert.match(res.headers.get("Cache-Control"), /max-age=3600/);
  assert.equal(res.headers.get("X-Compass-Proxy"), "legacy");
  assert.equal(res.headers.get("X-Compass-Legacy-Origin"), "https://legacy.compass.test");

  for (const path of ["brain-v2.js", "brain-kernel.js", "data/end-sem-datesheet.json", "data/notices.json", "api/sources", "api/section-list"]) {
    const allowed = await handleRequest(request(`/api/legacy/${path}`), env(), ctx(), { cache: null, fetch: async () => response("ok") });
    assert.notEqual(allowed.status, 403, `${path} should be proxied`);
  }
});

test("the proxy prefers the legacy service binding over a public subrequest", async () => {
  const bindingCalls = [];
  let publicCalls = 0;
  const deps = {
    cache: null,
    service: {
      fetch: async (url, init) => {
        bindingCalls.push({ url, init });
        return response("<html>bound timetable</html>", { headers: { "Content-Type": "text/html" } });
      }
    },
    fetch: async () => { publicCalls += 1; return response("should not be used"); }
  };
  const res = await handleRequest(request("/api/legacy/api/timetable?source=groups"), env(), ctx(), deps);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "<html>bound timetable</html>");
  assert.equal(bindingCalls.length, 1);
  assert.equal(bindingCalls[0].url, "https://legacy.compass.test/api/timetable?source=groups");
  assert.equal(bindingCalls[0].init.cf, undefined, "cf options stay on the public fetch");
  assert.equal(publicCalls, 0);
});

test("the proxy falls back to the public origin when the binding fails or 404s", async () => {
  for (const binding of [
    { fetch: async () => { throw new Error("binding unavailable"); } },
    { fetch: async () => response("missing", { status: 404 }) },
    { fetch: async () => response("unavailable", { status: 503 }) }
  ]) {
    const calls = [];
    const deps = {
      cache: null,
      service: binding,
      fetch: async (url) => { calls.push(url); return response("public fallback"); }
    };
    const res = await handleRequest(request("/api/legacy/api/sources"), env(), ctx(), deps);
    assert.equal(await res.text(), "public fallback");
    assert.deepEqual(calls, ["https://legacy.compass.test/api/sources"]);
  }
});

test("admin, unknown and private paths are refused", async () => {
  const deps = { cache: null, fetch: async () => { throw new Error("must not be fetched"); } };
  const refused = [
    "api/chat-admin",
    "api/admin",
    "api/admin/update",
    "api/student",
    "api/roster",
    "src/worker.js",
    "wrangler.jsonc",
    "public/app.js",
    "brain-v2.js.map",
    "notices/../secret.html",
    "api/timetable/../../secret"
  ];
  for (const path of refused) {
    const res = await handleRequest(request(`/api/legacy/${path}`), env(), ctx(), deps);
    assert.ok([400, 403].includes(res.status), `${path} should be refused, got ${res.status}`);
  }
});

test("encoded traversal and malformed encodings are rejected before fetch", async () => {
  let fetched = false;
  const deps = { cache: null, fetch: async () => { fetched = true; return response("no"); } };
  for (const path of ["/api/legacy/%2e%2e%2fsecret", "/api/legacy/..%2fsecret", "/api/legacy/%2Fetc%2Fpasswd", "/api/legacy/%00"]) {
    const res = await handleRequest(request(path), env(), ctx(), deps);
    assert.equal(res.status, 400, path);
  }
  assert.equal(fetched, false);
});

test("only GET, HEAD and the chat POST are accepted", async () => {
  const deps = { cache: null, fetch: async () => response("ok") };
  const put = await handleRequest(request("/api/legacy/api/timetable", { method: "PUT", body: "x" }), env(), ctx(), deps);
  assert.equal(put.status, 405);
  assert.match(put.headers.get("Allow"), /GET/);

  const postTimetable = await handleRequest(request("/api/legacy/api/timetable", { method: "POST", body: "x" }), env(), ctx(), deps);
  assert.equal(postTimetable.status, 405);

  const head = await handleRequest(request("/api/legacy/api/sources", { method: "HEAD" }), env(), ctx(), deps);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("the chat relay streams through without being cached", async () => {
  const calls = [];
  const deps = {
    cache: null,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return response("data: {\"delta\":\"hello\"}\n\n", { headers: { "Content-Type": "text/event-stream" } });
    }
  };
  const res = await handleRequest(request("/api/legacy/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "hello" })
  }), env(), ctx(), deps);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("X-Accel-Buffering"), "no");
  assert.equal(calls[0].url, "https://legacy.compass.test/api/chat");
  assert.equal(calls[0].init.method, "POST");
  assert.match(await res.text(), /hello/);
});

test("upstream headers cannot leak cookies or encodings", async () => {
  const deps = {
    cache: null,
    fetch: async () => response("ok", {
      headers: {
        "Content-Type": "text/plain",
        "Set-Cookie": "secret=1",
        "Content-Encoding": "gzip",
        "Content-Length": "999",
        "Transfer-Encoding": "chunked"
      }
    })
  };
  const res = await handleRequest(request("/api/legacy/api/sources"), env(), ctx(), deps);
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.equal(res.headers.get("Content-Encoding"), null);
  assert.equal(res.headers.get("Content-Length"), null);
  assert.equal(res.headers.get("Transfer-Encoding"), null);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});

test("a failed request falls back to the last verified cache", async () => {
  const cached = new Response("cached release", { status: 200, headers: { "Content-Type": "text/html" } });
  const deps = {
    cache: { match: async () => cached.clone(), put: async () => {} },
    fetch: async () => { throw new Error("network down"); }
  };
  const res = await handleRequest(request("/api/legacy/api/timetable?source=groups"), env(), ctx(), deps);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "cached release");
  assert.equal(res.headers.get("X-Compass-Stale"), "1");
  assert.equal(res.headers.get("X-Compass-Proxy"), "legacy");
});

test("a failed request without a cache reports 502 and never fabricates data", async () => {
  const deps = {
    cache: { match: async () => undefined, put: async () => {} },
    fetch: async () => { throw new Error("network down"); }
  };
  const res = await handleRequest(request("/api/legacy/api/timetable"), env(), ctx(), deps);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.match(body.error, /unreachable/i);
  assert.match(body.error, /last verified cache/i);
});

test("successful GET responses are cached, failures are not", async () => {
  const put = [];
  const deps = {
    cache: { match: async () => undefined, put: async (key, value) => { put.push({ key, value }); } },
    fetch: async () => response("fresh", { headers: { "Content-Type": "text/html" } })
  };
  const cacheCtx = ctx();
  await handleRequest(request("/api/legacy/api/timetable?source=rooms"), env(), cacheCtx, deps);
  await Promise.all(cacheCtx.pending);
  assert.equal(put.length, 1);
  assert.match(put[0].key.url, /\/api\/timetable\?source=rooms$/);

  const failing = {
    cache: { match: async () => undefined, put: async () => { throw new Error("must not cache"); } },
    fetch: async () => response("bad", { status: 500 })
  };
  const res = await handleRequest(request("/api/legacy/api/timetable"), env(), ctx(), failing);
  assert.equal(res.status, 500);
});

/* ── static assets ─────────────────────────────────────────────────────── */

test("static assets are served through the binding", async () => {
  const res = await handleRequest(request("/"), env({
    ASSETS: {
      fetch: async (req) => response(`asset:${new URL(req.url).pathname}`, { headers: { "Content-Type": "application/octet-stream" } })
    }
  }), ctx());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "asset:/");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
});

test("HTML documents receive route-specific SEO metadata", async () => {
  const shell = "<!doctype html><html><head><!--COMPASS_SEO--><title>Old</title><!--/COMPASS_SEO--></head><body>app</body></html>";
  const res = await handleRequest(request("/timetable?section=CEA"), env({
    PUBLIC_ORIGIN: "https://next.compass.test",
    ASSETS: {
      fetch: async () => response(shell, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    }
  }), ctx());
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>CEA Timetable/);
  assert.match(html, /rel="canonical" href="https:\/\/next\.compass\.test\/timetable\?section=CEA"/);
  assert.match(html, /application\/ld\+json/);
  assert.doesNotMatch(html, /<title>Old<\/title>/);
  assert.match(html, /<body>app<\/body>/);
  assert.equal(res.headers.get("ETag"), null, "a rewritten document must not reuse the asset ETag");
  assert.match(res.headers.get("Cache-Control"), /no-cache/);
});

test("a conditional 304 from the asset binding is passed through untouched", async () => {
  // Regression: injecting a head into a 304's empty body produced a head-only
  // document that the browser then rendered as a blank page.
  const res = await handleRequest(request("/ask"), env({
    ASSETS: {
      fetch: async () => new Response(null, {
        status: 304,
        headers: { "Content-Type": "text/html; charset=utf-8", "ETag": '"abc"' }
      })
    }
  }), ctx());
  assert.equal(res.status, 304);
  assert.equal(await res.text(), "");
  assert.equal(res.headers.get("ETag"), '"abc"');
});

test("missing asset binding and unknown API routes are explicit", async () => {
  const missing = await handleRequest(request("/"), env(), ctx(), {});
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /asset binding/i);

  const unknown = await handleRequest(request("/api/nope"), env(), ctx(), {});
  assert.equal(unknown.status, 404);
  assert.match((await unknown.json()).hint, /\/api\/legacy\//);
});

test("mutating static requests are refused", async () => {
  const res = await handleRequest(request("/", { method: "POST", body: "x" }), env({
    ASSETS: { fetch: async () => response("should not happen") }
  }), ctx());
  assert.equal(res.status, 405);
});
