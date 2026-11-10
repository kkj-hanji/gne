/**
 * Small helpers shared by the bundling scripts.
 *
 * The daily refresh must never publish an empty or half-read snapshot, and it
 * must not create a commit just because a timestamp moved. Every builder reads
 * the previous bundle, keeps verified facts when its official source is
 * unreachable, and writes only when the meaningful content changed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const VOLATILE_KEY = /^(checkedAt|seededAt|generatedAt|updatedAt|builtAt)$/i;

/** Recursively drop freshness timestamps and sort keys for a stable comparison. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEY.test(key) || /CheckedAt$/i.test(key)) continue;
      out[key] = stable(value[key]);
    }
    return out;
  }
  return value;
}

/** Read a committed JSON bundle, or null when it does not exist / is invalid. */
export function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** True when two snapshots carry the same facts, ignoring freshness timestamps. */
export function isSameContent(previous, next) {
  if (!previous) return false;
  return JSON.stringify(stable(previous)) === JSON.stringify(stable(next));
}

/**
 * Write a snapshot to one or more paths only when its facts changed.
 * Returns true when the files were written.
 */
export function writeJsonWhenChanged(paths, value) {
  const list = Array.isArray(paths) ? paths : [paths];
  const previous = readJsonIfPresent(list[0]);
  if (isSameContent(previous, value)) {
    console.log(`${list[0]}: unchanged; keeping the verified snapshot.`);
    return false;
  }
  for (const path of list) writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return true;
}
