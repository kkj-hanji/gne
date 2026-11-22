export const PROFILE_HISTORY_LIMIT = 7;

function profileKey(profile) {
  const crn = String(profile?.crn || "").trim();
  if (crn) return `crn:${crn.toLocaleLowerCase()}`;
  const name = String(profile?.name || "").trim();
  return name ? `name:${name.toLocaleLowerCase()}` : "";
}

export function normalizeProfileHistory(records) {
  if (!Array.isArray(records)) return [];
  const seen = new Set();
  const history = [];
  for (const record of records) {
    const name = String(record?.name || "").trim().replace(/\s+/g, " ");
    const crn = String(record?.crn || "").trim();
    const entry = { name, crn };
    const key = profileKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    history.push(entry);
    if (history.length === PROFILE_HISTORY_LIMIT) break;
  }
  return history;
}

export function rememberProfile(history, profile) {
  const current = { name: String(profile?.name || "").trim(), crn: String(profile?.crn || "").trim() };
  if (!profileKey(current)) return normalizeProfileHistory(history);
  return normalizeProfileHistory([current, ...(Array.isArray(history) ? history : [])]);
}
