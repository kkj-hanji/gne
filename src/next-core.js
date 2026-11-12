/**
 * GNDEC Compass Next — Cloudflare Worker.
 *
 * The new app is served from /next via static assets. It shares the verified
 * official data and Brain engines with the frozen legacy Worker through a
 * strict allow-list proxy. The proxy cannot be pointed at
 * another host, it cannot fetch a path that is not public, and it never
 * forwards cookies.
 */

import { SITE, headTags, injectHead, normalizeOrigin, routeFromPath } from "../next/seo-meta.js";
import {
  ContentError,
  addEditor,
  authorize,
  deleteItem,
  getFile,
  listEditors,
  ownerTokenConfigured,
  publicPayload,
  putFile,
  readAll,
  readAudit,
  removeEditor,
  restorePrevious,
  upsertItem
} from "./content-store.js";
import { officialNoticesResponse } from "./official-notices.js";
import { ptuHolidaySourcesResponse } from "./ptu-holidays.js";

export const APP_NAME = "GNDEC Compass";
export const APP_VERSION = "2.2.5";
export const BUILD_DATE = "2026-11-12";
export const DEFAULT_LEGACY_ORIGIN = "https://gndec-compass.koush3069.workers.dev";

const PROXY_PREFIX = "/api/legacy/";
const MAX_PROXY_PATH = 320;

/** Only these legacy paths may be proxied. Everything else is refused. */
const ALLOWED_PATHS = Object.freeze([
  /^api\/timetable$/, /^api\/sources$/, /^api\/section-list$/, /^api\/faculty$/, /^api\/faculty\/profile$/,
  /^api\/faculty\/photo$/, /^api\/syllabus$/, /^api\/chat$/, /^api\/admin\/ai\/unlock$/, /^data\/[a-z0-9._-]+\.json$/,
  /^brain-kernel\.js$/, /^brain-v1-2\.js$/, /^brain-v2-2\.js$/, /^brain-v2\.js$/,
  /^academic-calendar\.js$/, /^academic-notices\.js$/, /^end-sem-datesheet\.js$/, /^campus\.js$/, /^mse2-theory\.js$/,
  /^notices\/[a-z0-9._-]+\.html$/
]);

function legacyOrigin(env) {
  const raw = String(env?.LEGACY_ORIGIN || DEFAULT_LEGACY_ORIGIN).trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return DEFAULT_LEGACY_ORIGIN;
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_LEGACY_ORIGIN;
  }
}

function isAllowed(path) {
  return ALLOWED_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Canonical public origin. A custom domain or env var wins; a local preview
 * keeps pointing search engines at production instead of localhost.
 */
export function publicOrigin(env = {}, requestUrl = "") {
  const configured = String(env?.PUBLIC_ORIGIN || "").trim();
  if (configured) return normalizeOrigin(configured);
  try {
    const url = new URL(requestUrl);
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)) return normalizeOrigin(url.origin);
  } catch { /* fall through */ }
  return normalizeOrigin(SITE.defaultOrigin);
}

/** Add route-specific SEO head tags to a static HTML document. */
export function injectSeoHead(html, { origin, pathname = "/", search = "" } = {}) {
  const resolved = routeFromPath(pathname, "");
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const section = params.get("section") || resolved.section || "";
  const query = params.get("q") || "";
  return injectHead(html, headTags({ origin, route: resolved.route, section, query }));
}


function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function securityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(self)");
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "manifest-src 'self'"
    ].join("; "));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withTimeout(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Fetch the frozen legacy Worker.
 *
 * A service binding is preferred because Workers cannot reliably call another
 * `*.workers.dev` Worker over the public internet from inside a Worker
 * (Cloudflare rejects same-zone loops). The public origin remains the fallback
 * for local preview and for accounts where the binding is not configured.
 */
async function fetchLegacy(env, deps, url, init) {
  const service = deps.service || (deps.fetch ? null : env?.LEGACY);
  const direct = () => (deps.fetch || globalThis.fetch)(url, init);
  if (service && typeof service.fetch === "function") {
    try {
      const { cf, ...bindingInit } = init;
      const response = await service.fetch(url, bindingInit);
      if (response.status !== 404 && response.status < 500) return response;
    } catch { /* fall through to the public origin */ }
  }
  return direct();
}

async function proxyRequest(request, env, ctx, deps = {}) {
  const url = new URL(request.url);
  const rest = url.pathname.slice(PROXY_PREFIX.length);
  if (!rest || rest.length > MAX_PROXY_PATH) return jsonResponse({ error: "Invalid legacy path." }, { status: 400 });

  let decoded;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return jsonResponse({ error: "Invalid legacy path encoding." }, { status: 400 });
  }
  if (decoded.includes("..") || decoded.includes("\0") || decoded.startsWith("/")) {
    return jsonResponse({ error: "Invalid legacy path." }, { status: 400 });
  }
  if (!isAllowed(decoded)) return jsonResponse({ error: "This legacy path is not public through Compass Next." }, { status: 403 });

  const method = request.method.toUpperCase();
  if (!["GET", "HEAD", "POST"].includes(method)) {
    return jsonResponse({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, HEAD, POST" } });
  }
  if (method === "POST" && decoded !== "api/chat" && decoded !== "api/admin/ai/unlock") {
    return jsonResponse({ error: "This legacy route does not accept POST through Compass Next." }, { status: 405 });
  }

  const origin = legacyOrigin(env);
  const upstream = new URL(`${origin}/${decoded}${url.search}`);
  const isChat = decoded === "api/chat";
  const cache = method === "GET" && !isChat && (deps.cache === undefined ? globalThis.caches?.default : deps.cache);
  const cacheKey = cache ? new Request(`${origin}/${decoded}${url.search}`, { method: "GET" }) : null;
  let requestBody = method === "POST" ? request.body : undefined;
  if (isChat && method === "POST") {
    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > MAX_JSON_BODY) return jsonResponse({ error: "The chat request is too large." }, { status: 413 });
    const rawBody = await request.clone().text();
    if (rawBody.length > MAX_JSON_BODY) return jsonResponse({ error: "The chat request is too large." }, { status: 413 });
    try {
      const payload = JSON.parse(rawBody);
      // Rebuild parsed JSON bodies as strings so the Worker relay does not pass
      // a consumed Request stream to fetch when it only needs to inspect it.
      requestBody = rawBody;
      if (payload?.adminProfile && !await hasActiveAdminAiSession(request, env, payload.adminProfile, payload.selection || {})) {
        delete payload.adminProfile;
        delete payload.selection;
        requestBody = JSON.stringify(payload);
      }
    } catch { /* the legacy relay returns its normal invalid-JSON error */ }
  }

  const requestHeaders = new Headers();
  const accept = request.headers.get("Accept");
  if (accept) requestHeaders.set("Accept", accept.slice(0, 200));
  const device = request.headers.get("X-Compass-Device");
  if (device && /^[a-zA-Z0-9._:-]{1,120}$/.test(device)) requestHeaders.set("X-Compass-Device", device);
  const clientIp = request.headers.get("CF-Connecting-IP");
  if ((isChat || decoded === "api/admin/ai/unlock") && clientIp && clientIp.length <= 80) requestHeaders.set("CF-Connecting-IP", clientIp);
  if (method === "POST") {
    requestHeaders.set("Content-Type", "application/json");
  }
  requestHeaders.set("X-Compass-Next", "1");

  let response;
  try {
    response = await fetchLegacy(env, deps, upstream.toString(), {
      method,
      headers: requestHeaders,
      body: requestBody,
      redirect: "manual",
      signal: withTimeout(isChat ? 120000 : 20000),
      cf: { cacheEverything: false }
    });
  } catch (error) {
    if (cache && cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const stale = new Response(cached.body, cached);
        stale.headers.set("X-Compass-Stale", "1");
        stale.headers.set("X-Compass-Proxy", "legacy");
        return securityHeaders(stale);
      }
    }
    return jsonResponse({ error: "The legacy data service is unreachable. Compass Next keeps the last verified cache.", detail: String(error?.message || error).slice(0, 160) }, { status: 502 });
  }

  const headers = new Headers(response.headers);
  for (const name of ["set-cookie", "set-cookie2", "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"]) {
    headers.delete(name);
  }
  headers.set("X-Compass-Proxy", "legacy");
  headers.set("X-Compass-Legacy-Origin", origin);
  headers.set("X-Content-Type-Options", "nosniff");
  if (isChat) {
    headers.set("Cache-Control", "no-store");
    headers.set("X-Accel-Buffering", "no");
  } else if (method === "GET" && response.ok) {
    const social = /^(api\/sources|api\/section-list)$/.test(decoded) ? 300 : 3600;
    headers.set("Cache-Control", `public, max-age=${social}, stale-while-revalidate=86400`);
  }

  if (cache && cacheKey && response.ok && method === "GET") {
    try {
      const toCache = new Response(response.clone().body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
          "Cache-Control": "public, max-age=3600"
        }
      });
      ctx?.waitUntil?.(cache.put(cacheKey, toCache));
    } catch { /* cache is best-effort */ }
  }

  return securityHeaders(new Response(method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  }));
}

export function versionPayload(env = {}) {
  return {
    app: {
      name: APP_NAME,
      version: String(env.APP_VERSION || APP_VERSION),
      channel: String(env.APP_CHANNEL || "stable"),
      build: String(env.BUILD_TIME || BUILD_DATE),
      schema: 3
    },
    legacy: {
      label: "GNDEC Compass — frozen current build",
      url: legacyOrigin(env),
      frozen: true,
      note: "The legacy build runs on its own origin and keeps its own service-worker scope."
    },
    previous: {
      label: "GNDEC Compass 2.0 — previous generation",
      url: String(env.V2_ORIGIN || "https://gndec-compass-v2.koush3069.workers.dev"),
      note: "A separate Worker. Opened in a new tab from Settings; no shared storage."
    },
    content: {
      store: Boolean(env?.CONTENT),
      admin: Boolean(env?.ADMIN_API_TOKEN)
    },
    engine: {
      local: true,
      brain: ["2.2", "1.2", "2.0"],
      externalAi: "open-ended only, optional, never used for timetable facts"
    },
    privacy: {
      profiles: "device only",
      questions: "deterministic local by default",
      analytics: "off by default"
    }
  };
}

/* ── Content API ────────────────────────────────────────────────────────── */

const MAX_JSON_BODY = 120_000;
const MAX_UPLOAD_BODY = 1_700_000;
const ADMIN_AI_SESSION_PREFIX = "gndec-next:admin-ai:";

function normalizeAdminName(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function configuredOwnerProfile(profile = {}, selection = {}) {
  const branch = normalizeAdminName(profile.branch);
  const correctBranch = branch === "ec" || branch === "electronics and communication engineering" || branch === "electronics and communication engineering ec";
  const crn = String(profile.crn || "").replace(/[^a-z0-9]+/gi, "").toUpperCase();
  return normalizeAdminName(profile.name) === "kaushik jain" && crn === "2617070" && correctBranch
    && String(profile.section || "").toUpperCase() === "ECB"
    && String(profile.subsection || profile.subgroup || "").toUpperCase() === "ECB1"
    && String(selection.group || "").toUpperCase() === "ECB"
    && String(selection.subgroup || "").toUpperCase() === "ECB1";
}

async function adminAiIdentity(request) {
  const deviceId = request.headers.get("X-Compass-Device") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!/^[a-z0-9][a-z0-9_-]{15,127}$/i.test(deviceId) || !ip || ip.length > 80) return null;
  const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { deviceId, ip, deviceHash: await digest(deviceId), ipHash: await digest(ip) };
}

async function adminProfileHash(profile, selection) {
  const fields = [profile.name, profile.crn, profile.registrationNo, profile.branch, profile.section, profile.subsection, selection.group, selection.subgroup]
    .map((value) => String(value || "").trim().toLowerCase()).join("|");
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fields)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hasActiveAdminAiSession(request, env, profile, selection) {
  if (!env.CONTENT || !configuredOwnerProfile(profile, selection)) return false;
  const identity = await adminAiIdentity(request);
  if (!identity) return false;
  const saved = await env.CONTENT.get(`${ADMIN_AI_SESSION_PREFIX}${identity.deviceHash}`, "json");
  return Boolean(saved && saved.ipHash === identity.ipHash
    && saved.profileHash === await adminProfileHash(profile, selection)
    && Date.parse(saved.expiresAt || "") > Date.now());
}

async function adminAiRequest(request, env, ctx, deps = {}) {
  if (request.method !== "POST") return jsonResponse({ error: "Use POST for Admin AI enrollment." }, { status: 405, headers: { Allow: "POST" } });
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return jsonResponse({ error: "Cross-origin Admin AI requests are refused." }, { status: 403 });
  if (!env.CONTENT) return jsonResponse({ error: "Admin AI session storage is unavailable." }, { status: 503 });
  const identity = await adminAiIdentity(request);
  if (!identity) return jsonResponse({ error: "A valid Compass device and Cloudflare client network are required." }, { status: 400 });
  let body;
  try { body = await readJsonBody(request); }
  catch (error) { return contentErrorResponse(error); }
  const profile = body?.profile || {};
  const selection = body?.selection || {};
  if (!configuredOwnerProfile(profile, selection)) return jsonResponse({ error: "Admin AI mode requires the verified owner profile with ECB1 selected." }, { status: 403 });

  const key = `${ADMIN_AI_SESSION_PREFIX}${identity.deviceHash}`;
  const profileHash = await adminProfileHash(profile, selection);
  if (new URL(request.url).pathname === "/api/admin/ai/status") {
    const saved = await env.CONTENT.get(key, "json");
    const active = Boolean(saved && saved.ipHash === identity.ipHash && saved.profileHash === profileHash && Date.parse(saved.expiresAt || "") > Date.now());
    if (!active) return jsonResponse({ ok: false, active: false }, { status: 200 });
    return jsonResponse({ ok: true, active: true, expiresAt: saved.expiresAt });
  }

  const unlockRequest = new Request(new URL("/api/legacy/api/admin/ai/unlock", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Compass-Device": identity.deviceId, "CF-Connecting-IP": identity.ip },
    body: JSON.stringify({ profile })
  });
  const unlockResponse = await proxyRequest(unlockRequest, env, ctx, deps);
  let unlocked;
  try { unlocked = await unlockResponse.json(); } catch { unlocked = null; }
  if (!unlockResponse.ok || !unlocked?.expiresAt) {
    return jsonResponse({ error: unlocked?.error || "The legacy AI service refused enrollment." }, { status: unlockResponse.status || 502 });
  }
  const ttl = Math.max(60, Math.ceil((Date.parse(unlocked.expiresAt) - Date.now()) / 1000));
  await env.CONTENT.put(key, JSON.stringify({ ipHash: identity.ipHash, profileHash, expiresAt: unlocked.expiresAt }), { expirationTtl: ttl });
  return jsonResponse({ ok: true, expiresAt: unlocked.expiresAt });
}

async function readJsonBody(request) {
  const contentType = String(request.headers.get("Content-Type") || "");
  if (!/application\/json/i.test(contentType)) {
    throw new ContentError("Send JSON with Content-Type: application/json.");
  }
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_JSON_BODY) throw new ContentError("The request body is too large.", 413);
  const text = await request.text();
  if (text.length > MAX_JSON_BODY) throw new ContentError("The request body is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ContentError("The request body is not valid JSON.");
  }
}

async function requireAuth(env, request) {
  const auth = await authorize(env, request);
  if (!auth.ok) throw new ContentError("A valid admin token is required.", 401);
  return auth;
}

function contentErrorResponse(error) {
  const status = error instanceof ContentError ? error.status : 500;
  return jsonResponse({
    error: status === 500 ? "The content store could not complete this request." : error.message
  }, { status });
}

async function publicContent(env) {
  const all = await readAll(env);
  return publicPayload(all);
}

async function adminRequest(request, env, deps = {}) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === "/api/content") {
    if (method !== "GET" && method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const payload = await publicContent(env);
    return jsonResponse(payload, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" }
    });
  }

  if (url.pathname.startsWith("/api/content/file/")) {
    if (method !== "GET" && method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const id = url.pathname.slice("/api/content/file/".length);
    const file = await getFile(env, id);
    if (!file) return jsonResponse({ error: "File not found." }, { status: 404 });
    return new Response(method === "HEAD" ? null : file.bytes, {
      status: 200,
      headers: {
        "Content-Type": file.type,
        "Content-Length": String(file.bytes.byteLength || file.bytes.length || 0),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${String(file.name).replace(/[^\w.\- ]+/g, "_").slice(0, 80)}"`
      }
    });
  }

  const auth = await requireAuth(env, request);

  if (url.pathname === "/api/admin/session") {
    return jsonResponse({
      ok: true,
      role: auth.role,
      actor: auth.actor,
      store: Boolean(env?.CONTENT),
      ownerToken: await ownerTokenConfigured(env)
    });
  }

  if (url.pathname === "/api/admin/content" && (method === "GET" || method === "HEAD")) {
    const all = await readAll(env);
    return jsonResponse({
      ...all,
      editors: auth.role === "owner" ? await listEditors(env) : [],
      audit: await readAudit(env, 40),
      role: auth.role
    });
  }

  if (url.pathname === "/api/admin/audit" && (method === "GET" || method === "HEAD")) {
    return jsonResponse({ audit: await readAudit(env, 60) });
  }

  if (url.pathname === "/api/admin/content" && method === "POST") {
    const body = await readJsonBody(request);
    const action = String(body?.action || "upsert").toLowerCase();
    if (action === "upsert") {
      const item = await upsertItem(env, body?.collection, body?.item, { actor: auth.actor });
      return jsonResponse({ ok: true, item });
    }
    if (action === "delete") {
      return jsonResponse({ ok: true, ...(await deleteItem(env, body?.collection, body?.id, { actor: auth.actor })) });
    }
    if (action === "restore") {
      return jsonResponse({ ok: true, ...(await restorePrevious(env, body?.collection, { actor: auth.actor })) });
    }
    throw new ContentError("Unknown content action.");
  }

  if (url.pathname === "/api/admin/upload" && method === "POST") {
    const declared = Number(request.headers.get("Content-Length") || 0);
    if (declared > MAX_UPLOAD_BODY) throw new ContentError("The upload is larger than 1.5 MB.", 413);
    const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim();
    const bytes = new Uint8Array(await request.arrayBuffer());
    const name = url.searchParams.get("name") || "upload";
    const file = await putFile(env, { bytes, type, name });
    return jsonResponse({ ok: true, ...file });
  }

  if (url.pathname === "/api/admin/editors") {
    if (auth.role !== "owner") throw new ContentError("Only the owner can manage editors.", 403);
    if (method === "GET") return jsonResponse({ editors: await listEditors(env) });
    if (method === "POST") {
      const body = await readJsonBody(request);
      return jsonResponse({ ok: true, editors: await addEditor(env, { name: body?.name, token: body?.token }) });
    }
    if (method === "DELETE") {
      const body = await readJsonBody(request);
      return jsonResponse({ ok: true, editors: await removeEditor(env, { name: body?.name }) });
    }
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  return jsonResponse({ error: "Unknown admin route." }, { status: 404 });
}

export async function handleRequest(request, env = {}, ctx = {}, deps = {}) {
  const url = new URL(request.url);

  if (url.pathname === "/api/official-notices") {
    return securityHeaders(await officialNoticesResponse(request, env, ctx, deps.officialNotices || {}));
  }

  if (url.pathname === "/api/ptu-holidays") {
    return securityHeaders(await ptuHolidaySourcesResponse(request, env, ctx, deps.ptuHolidays || {}));
  }

  if (url.pathname === "/api/health") {
    return securityHeaders(jsonResponse({
      ok: true,
      app: APP_NAME,
      version: String(env.APP_VERSION || APP_VERSION),
      legacy: legacyOrigin(env),
      content: Boolean(env?.CONTENT),
      time: new Date().toISOString()
    }));
  }

  if (url.pathname === "/api/version") {
    return securityHeaders(jsonResponse(versionPayload(env), {
      headers: { "Cache-Control": "public, max-age=120" }
    }));
  }

  if (url.pathname === "/api/admin/ai/unlock" || url.pathname === "/api/admin/ai/status") {
    try { return securityHeaders(await adminAiRequest(request, env, ctx, deps)); }
    catch { return securityHeaders(jsonResponse({ error: "Admin AI enrollment could not be completed." }, { status: 502 })); }
  }

  if (url.pathname === "/api/content" || url.pathname.startsWith("/api/content/") || url.pathname.startsWith("/api/admin/")) {
    try {
      return securityHeaders(await adminRequest(request, env, deps));
    } catch (error) {
      return securityHeaders(contentErrorResponse(error));
    }
  }

  if (url.pathname.startsWith(PROXY_PREFIX)) {
    return proxyRequest(request, env, ctx, deps);
  }

  if (url.pathname.startsWith("/api/")) {
    return securityHeaders(jsonResponse({
      error: "Unknown Compass Next API route.",
      hint: "Public data is available under /api/legacy/."
    }, { status: 404 }));
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return securityHeaders(jsonResponse({ error: "Method not allowed." }, { status: 405 }));
  }

  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return securityHeaders(jsonResponse({ error: "The static asset binding is not configured." }, { status: 503 }));
  }

  const response = await env.ASSETS.fetch(request);
  const contentType = response.headers.get("Content-Type") || "";
  const isDocument = /text\/html/i.test(contentType) && request.method === "GET";

  if (!isDocument) return securityHeaders(response);

  // A conditional request must never be rewritten: the asset binding may
  // answer 304 with an empty body, and injecting a head into that would serve
  // a head-only document. Only transform a complete 200 response.
  if (response.status !== 200) return securityHeaders(response);

  // Inject per-route metadata before the SPA shell reaches a crawler.
  const html = await response.text();
  const head = injectSeoHead(html, {
    origin: publicOrigin(env, request.url),
    pathname: url.pathname,
    search: url.search
  });
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache");
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  // The upstream ETag belongs to the unmodified shell, so it can no longer be
  // used to revalidate this rewritten document.
  headers.delete("ETag");
  headers.delete("Last-Modified");
  return securityHeaders(new Response(head, { status: 200, headers }));
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
