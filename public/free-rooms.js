/* Free-room grouping for the official GNDEC room timetable.
   Everything here is derived from published room labels only: no room is
   assigned to a department, floor or building unless the official timetable
   prints that word in the label. */
(function (scope) {
  "use strict";

  const BLOCK_ORDER = ["F", "G", "S", "A"];
  const LABELS = {
    F: "F block",
    G: "G block",
    S: "S block",
    A: "A block"
  };
  const NAMED = "Labs and named rooms";
  const OTHER = "Other published rooms";

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function zoneOf(label) {
    const text = clean(label);
    if (!text) return OTHER;
    const block = /^([A-Z])\s*\d/i.exec(text);
    if (block && BLOCK_ORDER.includes(block[1].toUpperCase())) return LABELS[block[1].toUpperCase()];
    if (/\b(?:LAB|LABORATORY|WORKSHOP|WORKSHOPS|STUDIO)\b/i.test(text)) return NAMED;
    return OTHER;
  }

  function orderOf(zone) {
    const index = Object.values(LABELS).indexOf(zone);
    if (index >= 0) return index;
    return zone === NAMED ? BLOCK_ORDER.length : BLOCK_ORDER.length + 1;
  }

  function compareRooms(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  }

  /**
   * Group published room labels into blocks, keep the official spelling, and
   * never invent a room or a department.
   * @param {string[]} rooms
   * @returns {{total:number, groups:Array<{label:string, rooms:string[], count:number}>}}
   */
  function groupRooms(rooms) {
    const seen = new Set();
    const buckets = new Map();
    (Array.isArray(rooms) ? rooms : []).forEach((room) => {
      const label = clean(room);
      if (!label) return;
      const key = label.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      const zone = zoneOf(label);
      if (!buckets.has(zone)) buckets.set(zone, []);
      buckets.get(zone).push(label);
    });
    const groups = [...buckets.entries()]
      .map(([label, items]) => ({ label, rooms: items.sort(compareRooms), count: items.length }))
      .sort((a, b) => orderOf(a.label) - orderOf(b.label) || a.label.localeCompare(b.label));
    return { total: seen.size, groups };
  }

  /** Short one-line summary used in narrow layouts and in the chat answer. */
  function summaryText(rooms, limit = 8) {
    const { total, groups } = groupRooms(rooms);
    if (!total) return "No published room is free at this time.";
    const parts = groups.slice(0, limit).map((group) => `${group.label} (${group.count})`);
    if (groups.length > limit) parts.push(`and ${groups.length - limit} more areas`);
    return `${total} free rooms: ${parts.join(" · ")}`;
  }

  /**
   * Normalise a question's area filter to the same zones used by the UI.
   * Returns "" when the question does not name an area.
   */
  function zoneFromQuestion(question) {
    const q = clean(question).toLowerCase();
    if (/\bf\s*(?:block|building)\b|\bf\s*[-–]?\s*rooms?\b/.test(q)) return LABELS.F;
    if (/\bg\s*(?:block|building)\b|\bg\s*[-–]?\s*rooms?\b/.test(q)) return LABELS.G;
    if (/\bs\s*(?:block|building)\b|\bs\s*[-–]?\s*rooms?\b/.test(q)) return LABELS.S;
    if (/\ba\s*(?:block|building)\b/.test(q)) return LABELS.A;
    if (/\blabs?\b|\blaborator(?:y|ies)\b|\bworkshops?\b/.test(q)) return NAMED;
    return "";
  }

  scope.CompassFreeRooms = Object.freeze({
    groupRooms,
    summaryText,
    zoneFromQuestion,
    zoneOf
  });
})(globalThis);
