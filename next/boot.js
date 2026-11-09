/* Compass Next — pre-paint theme boot.
   Runs synchronously before the stylesheet paint so the app never flashes the
   wrong theme. Deliberately tiny and defensive. */
(function () {
  "use strict";
  var KEY = "gndec-compass-next-settings-v2";
  var root = document.documentElement;
  var values = {};
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.values && typeof saved.values === "object") values = saved.values;
  } catch (_) { values = {}; }

  function pick(id, fallback) {
    return Object.prototype.hasOwnProperty.call(values, id) ? values[id] : fallback;
  }

  var theme = String(pick("appearance.theme", "system"));
  if (theme === "system") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  root.dataset.theme = theme === "light" ? "light" : theme === "oled" ? "oled" : "dark";
  root.dataset.accent = String(pick("appearance.accent", "emerald"));
  root.dataset.density = String(pick("appearance.density", "comfortable"));
  root.dataset.experience = String(pick("experience.mode", "new"));

  var scale = Number(pick("appearance.fontScale", 100));
  if (pick("a11y.largeText", false)) scale = Math.max(scale, 125);
  if (Number.isFinite(scale)) root.style.setProperty("--font-scale", (Math.min(130, Math.max(90, scale)) / 100).toFixed(2));

  var flags = {
    "is-reduced-motion": Boolean(pick("appearance.reduceMotion", false) || pick("experience.mode", "new") === "safe"),
    "is-high-contrast": Boolean(pick("appearance.highContrast", false)),
    "is-colorblind": Boolean(pick("appearance.colorBlindPalette", false)),
    "is-square": !pick("appearance.rounded", true),
    "is-glassless": !pick("appearance.glass", true) || pick("experience.mode", "new") === "safe",
    "is-dyslexic": Boolean(pick("a11y.dyslexiaFont", false)),
    "is-strong-focus": Boolean(pick("a11y.strongFocus", true))
  };
  Object.keys(flags).forEach(function (name) {
    root.classList.toggle(name, flags[name]);
  });
})();
