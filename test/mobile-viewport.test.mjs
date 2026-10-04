import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

function mobileHarness() {
  const h = createAppHarness();
  const { document } = parseHTML('<html><body><main><section class="page" data-page="chat"><input id="question-input"></section><section class="page" data-page="today"></section></main></body></html>');
  h.context.document = document;
  Object.assign(h.context.window, { innerWidth: 390, innerHeight: 800, visualViewport: { height: 800, offsetTop: 0, scale: 1 } });
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
  const h = mobileHarness();
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
  const h = mobileHarness();
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
  const h = mobileHarness();
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
