import test from "node:test";
import assert from "node:assert/strict";
import { deleteSnapshot, listSnapshots, saveSnapshot } from "../next/engine/storage.js";

test("verified release keys replace repeat snapshots instead of duplicating the same timetable", async () => {
  const id = `release-test-${Date.now()}`;
  const first = { id, releaseKey: id, version: "07-09-2026", createdAt: "2026-11-10T08:00:00.000Z", schedule: [{ id: "class-a" }] };
  const second = { ...first, createdAt: "2026-11-10T09:00:00.000Z" };
  try {
    assert.equal(await saveSnapshot(first), true);
    assert.equal(await saveSnapshot(second), true);
    const saved = (await listSnapshots()).filter((snapshot) => snapshot.id === id);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].releaseKey, id);
    assert.equal(saved[0].createdAt, second.createdAt);
  } finally {
    await deleteSnapshot(id);
  }
});
