import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../next/styles.css", import.meta.url), "utf8");

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    let value = hex.replace("#", "");
    if (value.length === 3) value = [...value].map((character) => character + character).join("");
    const [r, g, b] = value.match(/.{2}/g).map((channel) => {
      const linear = parseInt(channel, 16) / 255;
      return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("mobile navigation reuses the accessible sidebar SVG icons", () => {
  assert.match(app, /function navigationIconMarkup\(route\)/);
  assert.ok(app.includes('.nav-item[data-route="${route}"] .nav-icon svg'));
  assert.ok(app.includes('class="bottom-item-icon"'));
});

test("chat actions stay visible on touch devices without hover", () => {
  assert.match(styles, /@media \(pointer:\s*coarse\),\s*\(hover:\s*none\)\s*\{\s*\.msg-actions\s*\{\s*opacity:\s*1;\s*\}/);
  assert.ok(app.includes('data-action="copy-message"'));
  assert.ok(app.includes('data-action="ask-again"'));
});

test("shared surface and accent contrast design tokens have safe defaults", () => {
  assert.match(styles, /--surface-1:\s*var\(--surface\)/);
  assert.match(styles, /--accent-contrast:\s*#[0-9a-f]{6}/i);
  assert.match(styles, /\.msg\.user \.msg-bubble\s*\{[^}]*color:\s*var\(--accent-contrast\)/s);
});

test("generated controls declare button behavior explicitly", () => {
  const implicitButtons = [...app.matchAll(/<button\b(?![^>]*\btype\s*=)[^>]*>/g)];
  assert.equal(implicitButtons.length, 0, "all action buttons should be type=button; form submission must be explicit");
  assert.match(app, /<button[^>]*type="submit"/);
});

test("accent foreground choices meet readable contrast across bright themes", () => {
  const combinations = [
    ["#000", ["#a78bfa", "#8b5cf6"]],
    ["#000", ["#818cf8", "#6366f1"]],
    ["#000", ["#e879f9", "#c43bd5"]],
    ["#fff", ["#2563eb", "#1d4ed8"]],
    ["#fff", ["#b45309", "#92400e"]],
    ["#fff", ["#7c3aed", "#6d28d9"]],
    ["#fff", ["#0e7490", "#0b667f"]]
  ];
  for (const [foreground, backgrounds] of combinations) {
    for (const background of backgrounds) {
      assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} needs 4.5:1 contrast`);
    }
  }
  assert.match(styles, /\[data-accent="indigo"\], \[data-accent="violet"\], \[data-accent="plum"\] \{ --accent-contrast: #000; \}/);
  assert.match(styles, /\[data-accent="plum"\] \{ --accent-strong: #c43bd5; \}/);
  assert.match(styles, /\[data-accent="auto"\]\[data-palette="graphite"\]\[data-theme="light"\] \{ --accent:#0e7490; --accent-strong:#0b667f;/);
});

test("badges keep semantic color and do not pulse continuously", () => {
  const semanticBadges = styles.slice(styles.lastIndexOf("/* Accessible foregrounds and semantic status badges. */"));
  assert.match(semanticBadges, /\.badge\s*\{[^}]*background:\s*var\(--surface-2\)/s);
  assert.match(semanticBadges, /\.badge-ok\s*\{[^}]*color:\s*var\(--success-ink\)/s);
  assert.match(semanticBadges, /\.badge-warn\s*\{[^}]*color:\s*var\(--warning-ink\)/s);
  assert.match(semanticBadges, /\.badge-danger\s*\{[^}]*color:\s*var\(--danger-ink\)/s);
  assert.doesNotMatch(styles, /badge-ping/);
});
