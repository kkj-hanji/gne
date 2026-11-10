/** Private, local-only matching for the student's saved profile. */

export function normalizeRosterName(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizedIdentifier(value = "") {
  return String(value).replace(/\D/g, "");
}

/** Exact identifiers win. A saved name auto-matches only one exact roster name. */
export function matchProfileRecord(records = [], profile = {}) {
  const crn = normalizedIdentifier(profile.crn);
  const registration = normalizedIdentifier(profile.registrationNo);
  const serial = normalizedIdentifier(profile.serialNo || profile.currentSerialNo);
  const name = normalizeRosterName(profile.name);
  const matches = records.filter((record) => {
    if (crn || registration || serial) {
      const recordCrn = normalizedIdentifier(record?.crn);
      const recordRegistration = normalizedIdentifier(record?.registrationNo);
      const recordSerial = normalizedIdentifier(record?.serialNo || record?.currentSerialNo);
      return (crn && recordCrn === crn) || (registration && recordRegistration === registration) || (serial && recordSerial === serial);
    }
    return name && normalizeRosterName(record?.name) === name;
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Exact CRN/name first; partial names return choices for the student to confirm. */
export function findProfileRosterMatches(records = [], query = "") {
  const text = String(query).trim();
  const digits = normalizedIdentifier(text);
  if (digits.length >= 2 && digits.length === text.replace(/\s/g, "").length) {
    const ranked = records.map((record, index) => {
      const ids = [record?.crn, record?.registrationNo, record?.serialNo, record?.currentSerialNo].map(normalizedIdentifier).filter(Boolean);
      const exact = ids.some((value) => value === digits);
      const prefix = ids.some((value) => value.startsWith(digits));
      return { record, index, rank: exact ? 0 : prefix ? 1 : 2 };
    }).filter((item) => item.rank < 2).sort((a, b) => a.rank - b.rank || a.index - b.index);
    return ranked.slice(0, 8).map((item) => item.record);
  }
  const normalized = normalizeRosterName(text);
  if (normalized.length < 2) return [];
  const exact = records.filter((record) => normalizeRosterName(record?.name) === normalized);
  if (exact.length) return exact.slice(0, 8);
  const terms = normalized.split(" ").filter(Boolean);
  return records.filter((record) => {
    const name = normalizeRosterName(record?.name);
    return name && terms.every((term) => name.includes(term));
  }).slice(0, 8);
}
