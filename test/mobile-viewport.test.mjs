import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

function viewportHarness({ width = 390, height = 800 } = {}) {
  const h = createAppHarness();
  const { document } = parseHTML('<html><body><main><section class="page" data-page="chat"><input id="question-input"></section><section class="page" data-page="today"></section></main></body></html>');
  h.context.document = document;
  Object.assign(h.context.window, { innerWidth: width, innerHeight: height, visualViewport: { height, offsetTop: 0, scale: 1 } });
  h.context.location = { hash: "#today" };
  let focused = document.body;
  Object.defineProperty(document, "activeElement", { get: () => focused });
  const input = document.getElementById("question-input");
  input.focus = () => { focused = input; };
  input.blur = () => { focused = document.body; };
  return { ...h, document, input, viewport: h.context.window.visualViewport,
    sync: () => vm.runInContext("syncMobileViewport()", h.context),
    inset: () => document.documentElement.style.getPropertyValue("--compass-viewport-bottom") };
}

test("Android navigation tracks the visible bottom through keyboard open, pan, dismissal and repeat focus", () => {
  const h = viewportHarness();
  h.sync();assert.equal(h.inset(), "0px");
  for (let i = 0; i < 3; i++) {
    h.input.focus();h.viewport.height = 480;h.sync();
    assert.equal(h.inset(), "320px");
    assert.equal(h.document.documentElement.classList.contains("keyboard-open"), true);
    h.viewport.offsetTop = 40;h.sync();assert.equal(h.inset(), "280px");
    assert.equal(h.document.documentElement.style.getPropertyValue("--compass-viewport-top"), "40px");
    assert.equal(h.document.documentElement.classList.contains("compact-chat"), true);
    h.input.blur();h.sync();
    assert.equal(h.document.documentElement.classList.contains("keyboard-open"), false);
    // Keep tabs inside the visible area while the closing animation completes.
    assert.equal(h.inset(), "280px");
    h.viewport.height = 800;h.viewport.offsetTop = 0;h.sync();assert.equal(h.inset(), "0px");
    assert.equal(h.document.documentElement.classList.contains("compact-chat"), false);
  }
});

test("switching away from Ask Compass blurs the old input without waiting for a scroll", () => {
  const h = viewportHarness();
  h.input.focus();h.viewport.height = 480;h.sync();
  vm.runInContext('activatePage("today", false)', h.context);
  assert.equal(h.document.documentElement.classList.contains("chat-active"), false);
  assert.equal(h.document.activeElement, h.document.body);
  assert.equal(h.document.documentElement.classList.contains("keyboard-open"), false);
  h.viewport.height = 800;h.sync();assert.equal(h.inset(), "0px");
  vm.runInContext('activatePage("chat", false)', h.context);
  assert.equal(h.document.documentElement.classList.contains("chat-active"), true);
  assert.equal(h.inset(), "0px");
  vm.runInContext('activatePage("today", false)', h.context);
  assert.equal(h.document.documentElement.classList.contains("chat-active"), false);
});

test("resized layout, browser chrome, zoom, rotation and missing VisualViewport do not hide navigation", async () => {
  const h = viewportHarness();
  h.input.focus();h.context.window.innerHeight = 480;h.viewport.height = 480;h.sync();assert.equal(h.inset(), "0px");
  h.input.blur();h.context.window.innerHeight = 800;h.viewport.height = 750;h.sync();assert.equal(h.inset(), "50px");
  assert.equal(h.document.documentElement.classList.contains("keyboard-open"), false);
  h.viewport.scale = 2;h.viewport.height = 400;h.sync();assert.equal(h.inset(), "0px");
  h.viewport.scale = 1;h.context.window.innerHeight = 390;h.viewport.height = 390;h.sync();assert.equal(h.inset(), "0px");
  h.context.window.visualViewport = undefined;h.sync();assert.equal(h.inset(), "0px");
  assert.equal(h.document.documentElement.style.getPropertyValue("--compass-visual-viewport-height"), "390px");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /keyboard-open\s+\.bottom-nav/);
  assert.match(css, /bottom:var\(--compass-viewport-bottom,0px\)/);
});

test("desktop pinch zoom and panning preserve the chat layout height and origin", () => {
  const h = viewportHarness({ width: 1536, height: 864 });
  vm.runInContext('activatePage("chat", false)', h.context);
  h.input.focus();
  for (const scale of [1.1, 1.5, 2, 3]) {
    Object.assign(h.viewport, { scale, height: 864 / scale, offsetTop: 80, offsetLeft: 120 });
    h.sync();
    assert.equal(h.document.documentElement.style.getPropertyValue("--compass-visual-viewport-height"), "864px");
    assert.equal(h.document.documentElement.style.getPropertyValue("--compass-viewport-top"), "0px");
    assert.equal(h.inset(), "0px");
    assert.equal(h.document.documentElement.classList.contains("keyboard-open"), false);
    assert.equal(h.document.documentElement.classList.contains("compact-chat"), false);
    assert.equal(h.document.documentElement.classList.contains("pinch-zoomed"), true);
  }
  Object.assign(h.viewport, { scale: 1, height: 864, offsetTop: 20, offsetLeft: 0 });
  h.sync();
  assert.equal(h.document.documentElement.style.getPropertyValue("--compass-viewport-top"), "0px");
  assert.equal(h.document.documentElement.classList.contains("pinch-zoomed"), false);
});

test("browser percentage zoom follows the resized layout, including the navigation breakpoint", () => {
  const h = viewportHarness();
  vm.runInContext('activatePage("chat", false)', h.context);
  for (const zoom of [0.8, 1, 1.25, 1.5, 2, 1]) {
    const height = Math.round(864 / zoom);
    h.context.window.innerWidth = Math.round(1536 / zoom);
    h.context.window.innerHeight = height;
    Object.assign(h.viewport, { scale: 1, height, offsetTop: 0 });
    h.sync();
    assert.equal(h.document.documentElement.style.getPropertyValue("--compass-visual-viewport-height"), `${height}px`);
    assert.equal(h.inset(), "0px");
    assert.equal(h.document.documentElement.classList.contains("keyboard-open"), false);
    assert.equal(h.document.documentElement.classList.contains("pinch-zoomed"), false);
  }
});

test("mobile pinch zoom preserves page geometry and resumes keyboard handling after zoom reset", () => {
  const h = viewportHarness();
  vm.runInContext('activatePage("chat", false)', h.context);
  h.input.focus();
  Object.assign(h.viewport, { scale: 2, height: 400, offsetTop: 60 });
  h.sync();
  assert.equal(h.document.documentElement.style.getPropertyValue("--compass-visual-viewport-height"), "800px");
  assert.equal(h.document.documentElement.style.getPropertyValue("--compass-viewport-top"), "0px");
  assert.equal(h.inset(), "0px");
  assert.equal(h.document.documentElement.classList.contains("compact-chat"), false);
  assert.equal(h.document.documentElement.classList.contains("keyboard-open"), false);
  assert.equal(h.document.documentElement.classList.contains("pinch-zoomed"), true);
  Object.assign(h.viewport, { scale: 1, height: 480, offsetTop: 0 });
  h.sync();
  assert.equal(h.inset(), "320px");
  assert.equal(h.document.documentElement.classList.contains("keyboard-open"), true);
  assert.equal(h.document.documentElement.classList.contains("pinch-zoomed"), false);
});
