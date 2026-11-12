import seed from "./data/ptu-holidays-seed.json" with { type: "json" };

export const PTU_HOLIDAYS_URL = "https://ptu.ac.in/holidays/";
export const PTU_HOLIDAYS_KEY = "gndec-next:ptu-holidays:v1";
const MAX_INDEX_BYTES = 2_000_000;
const MAX_PDF_BYTES = 6_000_000;
const REFRESH_MS = 24 * 60 * 60 * 1000;

function safePdfUrl(raw, base = PTU_HOLIDAYS_URL) {
  try {
    const url = new URL(raw, base);
    return url.protocol === "https:" && url.hostname === "ptu.ac.in" && /^\/wp-content\/uploads\/[\w%./-]+\.pdf$/i.test(url.pathname) ? url.toString() : "";
  } catch { return ""; }
}

export function parsePtuHolidayIndex(html) {
  const source = String(html || "");
  if (!source || source.length > MAX_INDEX_BYTES) return {};
  const years = {};
  for (const row of source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const yearMatch = row[1].match(/calendar\s+year\s+(20\d{2})/i);
    const hrefMatch = row[1].match(/<a\b[^>]*href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["']/i);
    if (!yearMatch || !hrefMatch || !["2026", "2027"].includes(yearMatch[1])) continue;
    const year = yearMatch[1];
    const url = safePdfUrl(hrefMatch[1]);
    if (url) years[year] = { title: `Gazetted and reserved holidays of the calendar year ${year}`, url };
  }
  return years;
}

async function readBody(response, limit) {
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (length > limit) throw new Error("The PTU holiday source exceeds the safe size limit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error("The PTU holiday source exceeds the safe size limit.");
  return bytes;
}

async function fingerprint(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { Accept: "application/pdf" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`PTU holiday document returned HTTP ${response.status}.`);
  const bytes = await readBody(response, MAX_PDF_BYTES);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function decorate(years, seedYears) {
  return Object.fromEntries(Object.entries(years || {}).map(([year, item]) => {
    const expected = seedYears?.[year];
    return [year, {
      year,
      title: String(item?.title || expected?.title || `PTU holiday calendar ${year}`).slice(0, 140),
      url: safePdfUrl(item?.url || expected?.url),
      sha256: String(item?.sha256 || expected?.sha256 || "").toUpperCase(),
      changed: Boolean(item?.changed || (expected?.sha256 && item?.sha256 && item.sha256.toUpperCase() !== expected.sha256.toUpperCase()))
    }];
  }));
}

export async function fetchPtuHolidaySources({ fetchImpl = fetch, previous = seed } = {}) {
  const indexResponse = await fetchImpl(PTU_HOLIDAYS_URL, { headers: { Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(25000) });
  if (!indexResponse.ok) throw new Error(`PTU holiday page returned HTTP ${indexResponse.status}.`);
  const html = new TextDecoder().decode(await readBody(indexResponse, MAX_INDEX_BYTES));
  const links = parsePtuHolidayIndex(html);
  if (!links["2026"] || !links["2027"]) throw new Error("PTU holiday page did not provide both current calendar links.");
  const priorYears = previous?.years || {};
  const years = {};
  await Promise.all(Object.entries(links).map(async ([year, link]) => {
    const expected = seed.years[year];
    const old = priorYears[year] || expected;
    try {
      const sha256 = await fingerprint(fetchImpl, link.url);
      years[year] = { ...link, sha256, changed: Boolean(expected?.sha256 && sha256 !== expected.sha256.toUpperCase()) };
    } catch {
      // Keep the last confirmed content fingerprint. A URL replacement is still surfaced.
      years[year] = { ...link, sha256: old?.sha256 || "", changed: Boolean(old?.url && old.url !== link.url) || Boolean(old?.changed) };
    }
  }));
  return { source: PTU_HOLIDAYS_URL, checkedAt: new Date().toISOString(), years: decorate(years, seed.years) };
}

export async function refreshPtuHolidaySources(env, deps = {}) {
  const previous = await readPtuHolidaySources(env);
  try {
    const latest = await fetchPtuHolidaySources({ fetchImpl: deps.fetch || fetch, previous });
    await env?.CONTENT?.put(PTU_HOLIDAYS_KEY, JSON.stringify(latest));
    return latest;
  } catch (error) {
    return { ...previous, refreshError: String(error?.message || error).slice(0, 180) };
  }
}

export async function readPtuHolidaySources(env) {
  try {
    const saved = await env?.CONTENT?.get(PTU_HOLIDAYS_KEY, "json");
    if (saved?.years && Object.keys(saved.years).length) return { ...saved, years: decorate(saved.years, seed.years) };
  } catch { /* use the checked-in official-source links */ }
  return { ...seed, years: decorate(seed.years, seed.years) };
}

export async function ptuHolidaySourcesResponse(request, env, ctx, deps = {}) {
  if (new URL(request.url).pathname !== "/api/ptu-holidays") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return Response.json({ error: "Use GET." }, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  const value = await readPtuHolidaySources(env);
  const checkedAt = Date.parse(value.checkedAt || "");
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > REFRESH_MS) {
    const refresh = deps.refresh || refreshPtuHolidaySources;
    if (ctx?.waitUntil) ctx.waitUntil(refresh(env, deps.options || {}).catch(() => {}));
  }
  return Response.json(value, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800", "X-Content-Type-Options": "nosniff" } });
}

export { seed as ptuHolidaySeed };
