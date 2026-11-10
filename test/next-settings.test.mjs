import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACCENTS, CATEGORIES, DENSITIES, EXPERIENCES, FLAGS, FLAG_MAP, PRESETS,
  PRESET_MAP, SETTINGS_SCHEMA_VERSION, THEMES, flagsForCategory, getFlag,
  isMapFlagEnabled
} from "../next/settings-registry.js";
import {
  APPEARANCE_KEYS, EMPTY_PROFILE, applyPreset, changedFlags, coerceValue,
  defaultValues, exportBundle, importBundle, isFlagAvailable, loadProfile,
  loadUserValues, migrateLegacy, parseUrlOverrides, resetValues, resolveValues,
  sanitizeValues, saveProfile, saveUserValues
} from "../next/settings-store.js";

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
    dump: () => Object.fromEntries(map)
  };
}

test("settings registry has unique ids and complete metadata", () => {
  const ids = FLAGS.map((flag) => flag.id);
  assert.equal(new Set(ids).size, ids.length, "flag ids must be unique");
  assert.ok(FLAGS.length >= 90, "the new app should expose a broad settings surface");

  for (const flag of FLAGS) {
    assert.match(flag.id, /^[a-z0-9]+\.[a-zA-Z0-9]+$/, `${flag.id} must be namespaced`);
    assert.ok(flag.title && flag.description, `${flag.id} needs title and description`);
    assert.ok(CATEGORIES.some((category) => category.id === flag.category), `${flag.id} has an unknown category`);
    assert.ok(["boolean", "select", "range", "action", "info"].includes(flag.type), `${flag.id} has a supported type`);
    if (flag.type === "boolean") assert.equal(typeof flag.default, "boolean", `${flag.id} default must be boolean`);
    if (flag.type === "select") {
      assert.ok(Array.isArray(flag.values) && flag.values.length >= 2, `${flag.id} needs select values`);
      assert.equal(flag.values.filter((option) => option.value === flag.default).length, 1, `${flag.id} default must be a listed value`);
    }
    if (flag.type === "range") {
      assert.ok(Number.isFinite(flag.min) && Number.isFinite(flag.max) && flag.min < flag.max, `${flag.id} needs a range`);
      assert.ok(flag.default >= flag.min && flag.default <= flag.max, `${flag.id} default must sit inside its range`);
    }
    if (flag.dependsOn) {
      for (const dependency of flag.dependsOn.split(",")) {
        assert.ok(FLAG_MAP[dependency.trim()], `${flag.id} depends on unknown ${dependency}`);
      }
    }
  }
});

test("every category is declared, ordered and populated", () => {
  const orders = CATEGORIES.map((category) => category.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  for (const category of CATEGORIES) {
    assert.ok(flagsForCategory(category.id).length > 0, `${category.id} must contain at least one flag`);
  }
  assert.equal(CATEGORIES.length, 12);
});

test("settings open on a simple overview and keep technical controls under More settings", async () => {
  const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
  assert.match(app, /settingsCategory: "overview"/);
  assert.match(app, /Everyday preferences/);
  assert.match(app, /<strong>More settings<\/strong>/);
  assert.match(app, /Find your student profile/);
  assert.match(app, /renderProfileCard\(\)\}\s*<section class="card quick-settings"/);
  assert.match(app, /Admin mode active/);
  assert.match(app, /verified owner unlocks Admin AI mode with/);
  assert.match(app, /unlockAdminMode/);
  assert.match(app, /api\/admin\/ai\/unlock/);
  assert.match(app, /api\/admin\/ai\/status/);
  assert.match(app, /adminProfile: state\.profile, selection:/);
  assert.doesNotMatch(app, /data-action="export-ics"|Export \.ics/);
  assert.match(app, /data-profile-lookup-query/);
  assert.match(app, /data-profile="serialNo"|profile-serial/);
  assert.doesNotMatch(app, /Attendance target \(%\)/);
  assert.doesNotMatch(app, /controls across \$\{CATEGORIES\.length\} sections/);
  assert.match(app, /Technical details/);
  assert.match(app, /Special option · App versions & backups/);
  assert.match(app, /appearance\.palette/);
  assert.match(app, /appearance\.background/);
  assert.match(app, /function subgroupDisplay\(group, subgroup\)/);
  assert.match(app, /subgroupDisplay\(state\.group, subgroup\)/);
});

test("appearance enums stay in sync with the stylesheet", async () => {
  const css = await readFile(new URL("../next/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar[\s\S]*?background: var\(--surface-solid\);[\s\S]*?backdrop-filter: none/);
  for (const theme of THEMES) {
    if (theme === "system") continue;
    assert.match(css, new RegExp(`\\[data-theme="${theme}"\\]`), `missing theme ${theme}`);
  }
  for (const accent of ACCENTS) assert.ok(css.includes(`[data-accent="${accent}"]`), `missing accent ${accent}`);
  for (const density of DENSITIES) assert.ok(["comfortable", "compact"].includes(density));
  const html = await readFile(new URL("../next/index.html", import.meta.url), "utf8");
  for (const experience of EXPERIENCES) {
    const present = experience === "new"
      ? html.includes('data-experience="new"')
      : css.includes(`data-experience="${experience}"`);
    assert.ok(present, `missing experience ${experience}`);
  }
});

test("the map is never bundled and starts disabled", async () => {
  assert.equal(getFlag("rooms.map").default, false);
  assert.equal(getFlag("labs.map").default, false);
  assert.equal(isMapFlagEnabled(defaultValues()), false);
  assert.equal(isMapFlagEnabled({ "rooms.map": true }), true);
  // No map library, tile URL or map asset may ship in this build.
  const files = ["../next/app.js", "../next/index.html", "../next/sw.js"];
  for (const file of files) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /leaflet|mapbox|openstreetmap|\/tiles\/|tile\.\w+\./i, `${file} must not load map assets`);
  }
});

test("defaults contain every interactive flag and no action flags", () => {
  const values = defaultValues();
  for (const flag of FLAGS) {
    if (flag.type === "action" || flag.type === "info") {
      assert.equal(flag.id in values, false, `${flag.id} must not be stored`);
    } else {
      assert.equal(values[flag.id], flag.default, `${flag.id} default mismatch`);
    }
  }
  assert.equal(changedFlags(values).length, 0);
});

test("coercion rejects malformed values and clamps ranges", () => {
  const theme = getFlag("appearance.theme");
  assert.equal(coerceValue(theme, "dark"), "dark");
  assert.equal(coerceValue(theme, "neon"), "system");
  assert.equal(coerceValue(theme, null), "system");

  const toggle = getFlag("appearance.reduceMotion");
  assert.equal(coerceValue(toggle, "true"), true);
  assert.equal(coerceValue(toggle, "on"), true);
  assert.equal(coerceValue(toggle, "off"), false);
  assert.equal(coerceValue(toggle, 1), true);
  assert.equal(coerceValue(toggle, "maybe"), false);

  const scale = getFlag("appearance.fontScale");
  assert.equal(coerceValue(scale, 125), 125);
  assert.equal(coerceValue(scale, 500), 130);
  assert.equal(coerceValue(scale, 0), 90);
  assert.equal(coerceValue(scale, 103), 105);
  assert.equal(coerceValue(scale, "not-a-number"), 100);

  assert.deepEqual(sanitizeValues({ "appearance.theme": "dark", unknown: true }), {
    ...defaultValues(),
    "appearance.theme": "dark"
  });
});

test("URL overrides are parsed defensively", () => {
  assert.deepEqual(parseUrlOverrides("?ff=appearance.theme=dark,ask.engine=local"), {
    "appearance.theme": "dark",
    "ask.engine": "local"
  });
  assert.deepEqual(parseUrlOverrides("?ff=appearance.theme=neon"), { "appearance.theme": "system" });
  assert.deepEqual(parseUrlOverrides("?ff=privacy.deleteAll=1"), {});
  assert.deepEqual(parseUrlOverrides("?ff=unknown.flag=1"), {});
  assert.deepEqual(parseUrlOverrides("?other=1"), {});
  assert.deepEqual(parseUrlOverrides("?ff=appearance.accent=azure=extra"), { "appearance.accent": "emerald" });
});

test("precedence is URL > admin > device > default", () => {
  const user = { "appearance.theme": "light", "appearance.accent": "rose" };
  const admin = { "appearance.theme": "dark" };
  const { values, sources } = resolveValues({ user, admin, search: "?ff=appearance.theme=oled" });
  assert.equal(values["appearance.theme"], "oled");
  assert.equal(sources["appearance.theme"], "url");
  assert.equal(values["appearance.accent"], "rose");
  assert.equal(sources["appearance.accent"], "device");

  const withoutUrl = resolveValues({ user, admin });
  assert.equal(withoutUrl.values["appearance.theme"], "dark");
  assert.equal(withoutUrl.sources["appearance.theme"], "admin");

  const onlyUser = resolveValues({ user });
  assert.equal(onlyUser.values["appearance.theme"], "light");
  assert.equal(onlyUser.sources["appearance.theme"], "device");

  const fallback = resolveValues({});
  assert.equal(fallback.values["appearance.theme"], "system");
  assert.equal(fallback.sources["appearance.theme"], "default");
});

test("flag dependencies gate availability without deleting values", () => {
  const heatmap = getFlag("notifications.leadMinutes");
  assert.equal(isFlagAvailable(heatmap, { "notifications.classReminders": false }), false);
  assert.equal(isFlagAvailable(heatmap, { "notifications.classReminders": true }), true);
  assert.equal(isFlagAvailable(getFlag("labs.debugPanel"), { "labs.experiments": false }), false);
  assert.equal(isFlagAvailable(getFlag("labs.debugPanel"), { "labs.experiments": true }), true);
  assert.equal(isFlagAvailable(null, {}), false);
});

test("legacy settings migrate without inventing values", () => {
  const migrated = migrateLegacy({
    themeAccent: "azure",
    compactTimetable: true,
    reduceMotion: true,
    clockMode: "24h",
    timetableExperience: "week",
    preferredLanguage: "punjabi",
    brainMode: "legacy",
    attendanceTarget: 80,
    holidayAlerts: false,
    someUnknownLegacyKey: "ignored"
  }, false);
  assert.equal(migrated["appearance.accent"], "azure");
  assert.equal(migrated["appearance.density"], "compact");
  assert.equal(migrated["timetable.compact"], true);
  assert.equal(migrated["appearance.reduceMotion"], true);
  assert.equal(migrated["timetable.clock"], "24h");
  assert.equal(migrated["timetable.view"], "week");
  assert.equal(migrated["ask.language"], "pa");
  assert.equal(migrated["ask.engine"], "local");
  assert.equal(migrated["today.holidayBanner"], false);
  assert.equal(migrated.__attendanceTarget, 80);
  assert.equal("someUnknownLegacyKey" in migrated, false);
  assert.deepEqual(migrateLegacy(null), {});
  assert.deepEqual(migrateLegacy("not an object"), {});
});

test("loadUserValues migrates the legacy key once and keeps attendance", () => {
  const storage = memoryStorage({
    "gndec-compass-settings-v1": JSON.stringify({ clockMode: "24h", themeAccent: "violet" }),
    "gndec-compass-brain-v2-enabled-v1": "false"
  });
  const loaded = loadUserValues(storage);
  assert.ok(loaded.values);
  assert.equal(loaded.migratedFromLegacy, true);
  assert.equal(loaded.values["timetable.clock"], "24h");
  assert.equal(loaded.values["appearance.accent"], "violet");
  assert.equal(loaded.values["ask.engine"], "local");
  assert.equal(loaded.attendanceTarget, undefined);
});

test("saved settings survive an invalid schema and are sanitised", () => {
  const storage = memoryStorage({
    "gndec-compass-next-settings-v2": JSON.stringify({ schemaVersion: 999, values: { "appearance.theme": "oled", "appearance.fontScale": 999 } })
  });
  const values = loadUserValues(storage).values;
  assert.equal(values["appearance.theme"], "oled");
  assert.equal(values["appearance.fontScale"], 130);

  const broken = memoryStorage({ "gndec-compass-next-settings-v2": "{not json" });
  assert.equal(loadUserValues(broken).values["appearance.theme"], "system");
});

test("saveUserValues round-trips through storage", () => {
  const storage = memoryStorage();
  const saved = saveUserValues(storage, { "appearance.theme": "light", "appearance.accent": "amber" }, "2026-11-09T00:00:00.000Z");
  assert.equal(saved["appearance.theme"], "light");
  const payload = JSON.parse(storage.dump()["gndec-compass-next-settings-v2"]);
  assert.equal(payload.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(payload.updatedAt, "2026-11-09T00:00:00.000Z");
  assert.equal(loadUserValues(storage).values["appearance.accent"], "amber");
});

test("profiles are local, bounded and never invented", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadProfile(storage), EMPTY_PROFILE);

  const saved = saveProfile(storage, {
    name: "  Test Student  ",
    crn: "12345",
    serialNo: "68",
    section: "CEA",
    subsection: "CEA2",
    mentor: "DR MENTOR",
    mentorPhone: "9876543210",
    academicGroup: "CEA-M1",
    mentorVenue: "LH-101",
    attendanceTarget: 250,
    extra: "ignored"
  });
  assert.equal(saved.name, "Test Student");
  assert.equal(saved.serialNo, "68");
  assert.equal(saved.mentor, "DR MENTOR");
  assert.equal(saved.mentorPhone, "9876543210");
  assert.equal(saved.academicGroup, "CEA-M1");
  assert.equal(saved.mentorVenue, "LH-101");
  assert.equal(saved.attendanceTarget, 100);
  assert.equal("extra" in saved, false, "unknown profile keys must not be persisted");

  const loaded = loadProfile(storage);
  assert.equal(loaded.section, "CEA");
  assert.equal(loaded.subsection, "CEA2");
  assert.equal(loaded.name, "Test Student");
  assert.equal(loaded.academicGroup, "CEA-M1");
});

test("legacy profile migrates without a roster or server lookup", () => {
  const storage = memoryStorage({
    "gndec-compass-student-v1": JSON.stringify({
      name: "Legacy", section: "MEB", subgroup: "MEB1", crn: "9",
      mentor: "M", mentorMobile: "999", mentoringGroup: "MEB-M2", venue: "LH-2"
    })
  });
  const profile = loadProfile(storage);
  assert.equal(profile.name, "Legacy");
  assert.equal(profile.section, "MEB");
  assert.equal(profile.subsection, "MEB1");
  assert.equal(profile.mentorPhone, "999");
  assert.equal(profile.academicGroup, "MEB-M2");
  assert.equal(profile.mentorVenue, "LH-2");
  assert.equal(profile.migratedFromLegacy, true);
});

test("presets apply on top of current values and remain reversible", () => {
  const base = defaultValues();
  base["appearance.accent"] = "rose";
  base["today.hero"] = "minimal";

  const battery = applyPreset(base, "battery");
  assert.equal(battery["appearance.accent"], "rose", "a preset must not reset unrelated values");
  assert.equal(battery["today.hero"], "minimal");
  assert.equal(battery["appearance.reduceMotion"], true);
  assert.equal(battery["data.prefetchTomorrow"], false);

  const accessibility = applyPreset(base, "accessibility");
  assert.equal(accessibility["a11y.largeText"], true);
  assert.equal(accessibility["appearance.fontScale"], 125);
  assert.equal(accessibility["appearance.highContrast"], true);

  const developer = applyPreset(base, "developer");
  assert.equal(developer["labs.experiments"], true);
  assert.equal(developer["data.channel"], "beta");

  assert.deepEqual(applyPreset(base, "does-not-exist"), sanitizeValues(base));
  assert.equal(PRESETS.length, 6);
  for (const preset of PRESETS) {
    assert.ok(PRESET_MAP[preset.id], `${preset.id} must be indexed`);
    for (const key of Object.keys(preset.values)) assert.ok(FLAG_MAP[key], `${preset.id} references unknown ${key}`);
  }
});

test("resetValues resets one category or everything", () => {
  const values = { ...defaultValues(), "appearance.theme": "dark", "ask.engine": "local" };
  const appearanceReset = resetValues(values, "appearance");
  assert.equal(appearanceReset["appearance.theme"], "system");
  assert.equal(appearanceReset["ask.engine"], "local");

  const all = resetValues(values);
  assert.equal(all["appearance.theme"], "system");
  assert.equal(all["ask.engine"], "auto");
  assert.equal(changedFlags(all).length, 0);
});

test("export and import are explicit and validated", () => {
  const profile = { ...EMPTY_PROFILE, name: "Student", section: "CEA" };
  const bundle = exportBundle({ values: { "appearance.theme": "oled" }, profile, snapshots: [{ id: "a" }], chat: [{ role: "user" }, { role: "assistant" }] });
  assert.equal(bundle.app, "GNDEC Compass Next");
  assert.equal(bundle.values["appearance.theme"], "oled");
  assert.equal(bundle.profile.name, "Student");
  assert.ok(bundle.exportedAt);

  const imported = importBundle(bundle);
  assert.equal(imported.values["appearance.theme"], "oled");
  assert.equal(imported.profile.name, "Student");

  assert.equal(importBundle(null), null);
  assert.equal(importBundle({}), null);
  assert.equal(importBundle({ app: "Something else" }), null);
  assert.equal(importBundle({ values: "nope" }), null);

  const hostile = importBundle({ app: "GNDEC Compass Next", values: { "appearance.theme": "<script>alert(1)</script>" } });
  assert.equal(hostile.values["appearance.theme"], "system");
});

test("appearance keys are real flags", () => {
  for (const id of APPEARANCE_KEYS) assert.ok(FLAG_MAP[id], `${id} is not a declared flag`);
  assert.equal(APPEARANCE_KEYS.length, 14);
});
