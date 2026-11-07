# GNDEC Compass — cross-device, cross-browser and zoom compatibility plan

**Date:** 7 November 2026  
**Status:** research and planning only. No application code has been changed.  
**Scope:** Today, Timetable, Free rooms, Ask Compass, Profile lookup, Syllabus, Exams, installable PWA and offline mode.

---

## 1. Executive summary

The app is already stronger than most college PWAs on mobile. It has the correct viewport meta, safe-area handling, `dvh`/`svh` fallbacks, a real `visualViewport` keyboard/pinch implementation, 44 px touch targets on coarse pointers, guarded hover styles, reduced-motion/reduced-transparency/contrast/forced-colors support, horizontal scroll containers for timetable tables, and no user-agent sniffing.

The audit found **one true blocker, two high-impact issues, and a handful of medium/low issues**:

1. **Blocker — a regex lookbehind literal in the main `app.js`.**  
   `public/app.js:3097` contains `/(?<!\d)(\d{1,2})\.\s+/g`. Lookbehind is unsupported before Safari/iOS **16.4**. Because it is a *literal*, the entire `app.js` fails to **parse** on those browsers — the app never initialises (static shell only: no timetable, chat or profile), not just that one feature. This excludes iPhone 6s/7/SE (1st gen), iPad Air 2 and iPad mini 4 on iOS 15.8, and every browser on those devices (Chrome, Brave, Edge, Firefox on iOS all use WebKit). Removing it lowers the floor to **Safari/iOS 15.4**.
2. **High — the type scale is too small and is written in `px`.**  
   169 `px` font sizes versus 5 `rem`; the most common sizes are 10–13 px, body is 15 px, and at ≤360 px body drops to 14 px. This is hard to read on a phone and does not respond to browser/OS default-font-size settings. It also fails text-only zoom, which is a WCAG 1.4.4 concern.
3. **High — two unguarded `localStorage` reads at module initialisation.**  
   `state.selectedGroup` and `state.selectedSubgroup` read `localStorage` outside a `try` block. When storage is blocked (some in-app WebViews, hardened privacy settings, file:// previews), the exception kills the entire script before the app starts.
4. **Medium — `window-controls-overlay` is declared but not implemented.**  
   The manifest asks desktop Chromium to draw window controls over the page, but the CSS has no `env(titlebar-area-*)` handling. In an installed Chrome/Edge PWA on Windows the minimise/maximise/close buttons can overlap the top-right of the app. Removing the override (falling back to `standalone`) is safe until titlebar CSS exists.

The rest are small, specific fixes: a ~976 KB logo and a single 1254 px non-maskable icon, five unprefixed `backdrop-filter` declarations that Safari < 18 ignores, iPad Pro landscape inputs below 16 px (iOS zooms on focus), a missing `format-detection` meta, one `100vw` toast, and the total ~2.3 MB precache / ~1 MB synchronous JavaScript payload.

"Works on any browser, any version, any OS" is not a testable target. There are only **three rendering engines** — Chromium, WebKit and Gecko — and every browser is a skin over one of them. The plan below replaces "any" with a three-tier support policy, a measurable acceptance list, and a repeatable test matrix.

---

## 2. What is already correct

| Area | Current implementation | Why it matters |
|---|---|---|
| Viewport meta | `width=device-width, initial-scale=1, viewport-fit=cover`; no `user-scalable=no` | Correct scaling, pinch zoom allowed, notch support |
| Safe areas | 43 uses of `env(safe-area-inset-*)` | iPhone notch, home indicator, iPad |
| Dynamic viewport | `100vh` → `100svh` → `100dvh` ladder on the shell and chat page | Avoids the mobile URL-bar crop |
| Keyboard handling | `visualViewport` height/offset + `--compass-visual-viewport-height`, `--compass-viewport-bottom`, `--compass-viewport-top` | Chat composer and bottom nav stay above the keyboard |
| Pinch zoom | Detects `visualViewport.scale !== 1`, unpins the shell, adds `.pinch-zoomed` | Pinch magnifies and pans instead of breaking the layout |
| Input zoom (mobile) | `:where(input,select,textarea){font-size:16px}` at ≤860 px | Prevents iOS focus zoom on phones and most tablets |
| Touch targets | `min-height:44px` under `@media(hover:none),(pointer:coarse)` | Apple/Material ergonomics |
| Hover | All hover styling is inside the coarse-pointer guard | No sticky hover on touch |
| Reduced motion | `animation`/`transition` disabled, smooth scroll off | Vestibular safety |
| Contrast | `prefers-contrast: more` strengthens lines and muted text | Low-vision users |
| Forced colors | `forced-colors: active` block with `Canvas`/`CanvasText`/`Highlight` | Windows High Contrast |
| Reduced transparency | `prefers-reduced-transparency: reduce` block | Modern Safari/Chromium |
| Focus | `:focus-visible` outline, skip link | Keyboard users |
| Tables | `.week-table{overflow:auto}` and `.exam-table-scroll` | Data tables can scroll at 320 px / 400 % zoom |
| Hover/touch media | One guarded block, not scattered | Predictable |
| UA sniffing | None | Feature detection is the correct model |
| Secure-context UUID | `randomUUID` has a `Math.random` fallback | LAN/HTTP demos do not crash |
| Clipboard | `navigator.clipboard?.writeText` guarded with a fallback | HTTP and denied-permission safe |
| Service worker | Optional, versioned cache, `skipWaiting`/`claim` | Offline shell works |
| Print | Dedicated print stylesheet | Timetables/syllabus print cleanly |

These should be preserved. The work below is additive and surgical.

---

## 3. Verified defects

Severity: **B** = blocker, **H** = high, **M** = medium, **L** = low.

| ID | Sev | Finding | Evidence | Effect | Proposed fix |
|---|---|---|---|---|---|
| C-1 | **B** | Regex lookbehind literal | `public/app.js:3097` — `/(?<!\d)(\d{1,2})\.\s+/g` | Whole script fails to parse on Safari/iOS < 16.4; static shell only on iOS 15 devices and every iOS browser | Rewrite without lookbehind (capture the preceding char or check `match.index`); add a CI grep that fails on `(?<=`/`(?<!` in shipped JS |
| C-2 | **H** | 10–13 px type scale, `px` units | 169 `px` font sizes vs 5 `rem`; body 15 px, 14 px at ≤360 px; 26×12 px, 21×13 px, 14×11 px, 12×10 px | Hard to read on phones; ignores browser/OS font-size preference; text-only zoom fails | `html{font-size:100%}`, body `1rem`, 14 px minimum for secondary text, 13 px minimum for meta, `clamp()` for headings; keep px for borders/icons only |
| C-3 | **H** | Unguarded storage at startup | `public/app.js:90-91` — `localStorage.getItem(...)` outside `try` | App dies before first paint when storage is denied | `readStorage(key)` helper with `try/catch`; use it for every top-level read; also audit the other 64 calls |
| C-4 | **M** | Window Controls Overlay without titlebar CSS | `public/manifest.webmanifest` — `"display_override":["window-controls-overlay", …]`; no `titlebar-area-*` in `styles.css` | Installed Chrome/Edge PWA on Windows can put window buttons over the topbar | Remove `window-controls-overlay` until `env(titlebar-area-*)`, `app-region: drag` and control padding are implemented |
| C-5 | **M** | Icon weight and PWA icon set | `logo.png` = 976 KB; manifest has one 1254×1254 `purpose:any`; `apple-touch-icon` points at 1254 px | ~1 MB download for one icon; Android adaptive icon letterboxes; no maskable icon | Generate 32, 180, 192, 512 and 512-maskable assets (safe zone 80 %); keep 1024 for store/social; point `apple-touch-icon` at 180 |
| C-6 | **M** | iPad Pro landscape inputs <16 px | 16 px rule is only inside `@media(max-width:860px)` | iOS focus zoom on 1024/1366 px iPad viewports and touch laptops | Set form controls to `max(16px, 1em)` globally, or under `@media(pointer:coarse)` at every width |
| C-7 | **L** | Five unprefixed `backdrop-filter` declarations | `styles.css` — 10 total, 5 with `-webkit-`; Safari unprefixed only from 18 | Blur silently disappears on Safari 15.4–17; if a surface relies on blur for contrast, text can be less legible | Keep `-webkit-` first, ensure a near-opaque fallback background (already true for the bottom nav), and add an `@supports` guard where blur is decorative |
| C-8 | **L** | No `format-detection` meta | `index.html` head | iOS may auto-link phone numbers/addresses in faculty contact text; blue links and layout shifts | Add `format-detection: telephone=no,address=no,email=no`; render real `tel:`/`mailto:` links explicitly |
| C-9 | **L** | `100vw` in toast | `styles.css:374` | `100vw` includes the desktop scrollbar; can cause a hidden horizontal overflow (body is `overflow-x:hidden`) | Use `width: min(…, calc(100% - 32px))` or `100dvw` with a `100%` fallback |
| C-10 | **L** | No browser compatibility test harness | `package.json` has no Playwright/Puppeteer/axe/Lighthouse | Regressions like C-1 are only found by hand | Add Playwright (Chromium/Firefox/WebKit), axe-core, Lighthouse CI and a browserslist-based CSS/JS lint |
| C-11 | **M** | Large synchronous payload | `app.js` 546 KB; brain modules 383 KB; styles 69 KB; 17 synchronous scripts; precache ≈2.3 MB | Slow first interaction on budget Android / 3G; parse cost | Minify at deploy, compress the logo, defer/lazy-load non-critical modules, trim precache, add performance budgets |
| C-12 | **L** | `crypto.subtle` assumes a secure context | One call in the import/date-sheet path | `crypto.subtle` is `undefined` on plain `http://<LAN-IP>` demos | Guard with `globalThis.crypto?.subtle` and fall back to a non-crypto hash, or require HTTPS in the UI message |
| C-13 | **L** | `requestIdleCallback` is disabled in Safari | Two call sites already choose `setTimeout` when absent | Prewarm happens ~2 s later on iOS; not a failure | Keep the guard; consider 500 ms for the iOS path |
| C-14 | **L** | `text-size-adjust:100%` trade-off | `html` rule disables font boosting | Android Chrome "Font size" and iOS `aA` behaviour must be verified; rem is the durable fix | Keep 100 % to stop landscape inflation, but move text to rem and test OS/browser text scaling |
| C-15 | **L** | Dark-only theme | `color-scheme: dark`, one static `theme-color` | Dark UI is harder to read outdoors; users cannot follow OS light mode | Optional: add a light theme with `prefers-color-scheme: light`, or an explicit toggle; keep dark as default |
| C-16 | **L** | App is inert before ~1 MB of JS executes | 17 `<script>` tags at end of body | On a 2 GB Android phone the shell paints, then stalls before interaction | Split brain/exam modules behind dynamic import with an honest loading state; keep deterministic fallback order |

Nothing in this list requires changing the Compass Brain, the data model, the fallback chain, or the official-source rules.

---

## 4. Support policy

### 4.1 Three tiers

| Tier | Meaning | Targets |
|---|---|---|
| **Tier 1 — fully supported** | Automated + real-device tested every release; regressions block a release | Chrome/Edge/Brave/Opera **109+**; Firefox **115 ESR+**; Safari/iOS **15.4+**; Samsung Internet **21+**; Android **8+** with Chrome/WebView 109+; Windows 10/11, macOS 12+, Linux, iPadOS 15.4+ |
| **Tier 2 — works, best effort** | Should work through feature detection; not regression-tested every release | Chrome 92–108; Firefox 102–114; Safari 14–15.3; Samsung Internet 16–20; UC Browser 15.5; Windows 7/8.1 with frozen Chrome/Edge 109 or Firefox 115 ESR; Android 7 with Chrome 109–119 |
| **Tier 3 — unsupported, graceful message** | Do not test; explain instead of showing a broken screen | IE11, Opera Mini, Chrome < 62, Safari < 14, iOS < 14, Android < 7, KaiOS, Smart TV browsers |

Why these floors:

- **Chrome 109** is the last Chromium for Windows 7/8.1 and supports every feature the app uses today (`dvh` since 108, `.at()` since 92, `randomUUID` since 92, `??=` since 85, `:focus-visible` since 86). It is a coherent syntax/API floor.
- **Safari 15.4** supplies `dvh`, `.at()`, `randomUUID`, `:focus-visible`, `accent-color`, `:is()/:where()`, `gap` in flexbox, `clamp()` and `inset`. Removing the lookbehind makes 15.4 reachable.
- **Firefox 115 ESR** supplies `dvh` (101), `backdrop-filter` (103), `scrollbar-gutter` (97), `:focus-visible` (85).
- **Samsung Internet 21** is the first with `dvh`; it also covers the Chromium features above.
- iOS 15.4+ covers iPhone 6s/7/SE (1st gen), iPad Air 2, iPad mini 4 — devices still common as hand-me-downs in India. Keeping the lookbehind would raise the floor to iOS 16.4 and cut them off.

### 4.2 Engine reality

| Platform | Browsers | Engine |
|---|---|---|
| iOS/iPadOS (outside the EU) | Safari, Chrome, Brave, Edge, Firefox, Opera | WebKit — one engine, so Safari testing covers engine bugs; still smoke-test Brave Shields and browser UI |
| Android | Chrome, Edge, Brave, Opera, Samsung Internet, UC, WebView | Chromium (Samsung/UC lag), Firefox = Gecko |
| Windows | Chrome, Edge, Brave, Opera | Chromium; Firefox = Gecko |
| macOS | Safari | WebKit; Chrome/Edge/Brave/Firefox as above |
| Linux | Chrome, Edge, Brave, Firefox | Chromium/Gecko |

The real test matrix is therefore **3 engines × 3 form factors × 3 input modes** (touch, mouse, keyboard), not "every browser".

### 4.3 Feature floors used by the app

| Feature | Chrome | Safari/iOS | Firefox | Samsung Internet | Used for | Fallback |
|---|---|---|---|---|---|---|
| Regex lookbehind | 62 | **16.4** | 78 | 8.2 | Serial parsing at `app.js:3097` | **Must remove** |
| `dvh`/`svh` | 108 | 15.4 | 101 | 21 | Shell/chat height | `100vh` already present |
| `Array.prototype.at` | 92 | 15.4 | 90 | 16 | 7 call sites | Could polyfill if floor drops |
| `crypto.randomUUID` | 92 (secure ctx) | 15.4 | 95 | 16 | Device id | Present |
| `??=`, `\|\|=`, `&&=` | 85 | 14 | 79 | 14 | 5 call sites | None needed at floor |
| `:focus-visible` | 86 | 15.4 | 85 | 15 | Focus rings | `:focus` fallback if floor drops |
| `backdrop-filter` | 76 | 9 prefixed / 18 unprefixed | 103 | 12 | Glass surfaces | Opaque background |
| `scrollbar-gutter` | 94 | 18.2 | 97 | 17 | Stable gutter | Ignored, harmless |
| `requestIdleCallback` | 47 | **disabled by default** | 55 | 5 | Prewarm | `setTimeout` already present |
| `100dvh` inside `calc()` | 108 | 15.4 | 101 | 21 | Chat page | Ladder present |

Data verified against caniuse (October 2026 data; stable at the time of writing: Chrome 157, Edge 156, Firefox 159, Safari 27.2, Samsung Internet 31).

### 4.4 OS coverage that follows

| OS | Tier 1 path | Notes |
|---|---|---|
| Windows 10/11 | Current Chrome/Edge/Brave/Firefox | Test 100 %, 125 %, 150 % scaling; High Contrast; installed PWA |
| Windows 7/8.1 | Chrome/Edge 109, Firefox 115 ESR | Frozen browsers; Tier 2; no current Chrome available |
| macOS 12+ | Safari 15.4+ | Safari 15.4 requires Monterey/Big Sur-era OS; current Chrome requires macOS 13+ |
| macOS 13+ | Current Chrome/Edge/Brave/Firefox | Tier 1 |
| Android 10+ | Current Chrome/WebView, Edge, Brave, Samsung Internet 21+ | Tier 1 |
| Android 8–9 | Chrome/WebView 109–119 | Tier 1 if browser ≥109; Tier 2 otherwise |
| Android 7 | Chrome 109–119 | Tier 2 |
| iOS/iPadOS 15.4+ | Safari + all WebKit browsers | Tier 1 only after C-1 is fixed |
| iOS 14 and below | — | Tier 3 |
| Linux | Chrome/Edge 109+, Firefox 115+ | Tier 1 |
| Windows XP/Vista, Android ≤6, IE11, Opera Mini | — | Tier 3 |

---

## 5. Zoom and text resizing

There are four different kinds of "zoom", and they fail differently:

| Zoom type | What happens | Current state | Required work |
|---|---|---|---|
| **Full-page browser zoom** (Ctrl +/- , menu) | CSS px viewport shrinks; media queries reflow | Breakpoints at 280–1080 cover it; 320 px (400 % of 1280) is supported | Verify every page at 320×256 and 400 %; fix the `100vw` toast and any clipped fixed element |
| **Text-only zoom / default font size** (Firefox "default font size", Chrome/Android "Font size", Windows "Make text bigger") | Only font sizes scale; px text does **not** | 169 px declarations; only 5 rem | Convert text to rem; test at 200 % text |
| **Pinch zoom** (touch) | Visual viewport magnifies and pans; layout unchanged | Explicitly handled by `syncMobileViewport()` and `.pinch-zoomed` | Verify at 500 % on iOS and Android: nav reachable, composer visible, no clipped content |
| **OS display scaling** (Windows 125/150/200 %, Android display size) | Device pixel ratio and CSS viewport change | Breakpoints handle it | Test 1366×768 at 150 % (≈911×512 CSS px) and 1920×1080 at 200 % (960×540) |

Acceptance targets:

- **WCAG 1.4.4 (Resize text):** at 200 % text size, no content or functionality is lost.
- **WCAG 1.4.10 (Reflow):** at 320 CSS px width (400 % of 1280 px), no two-dimensional scrolling except for data tables/maps. Timetable tables may scroll horizontally inside their container; the page itself must not.
- **WCAG 1.4.12 (Text spacing):** line-height 1.5, letter-spacing 0.12 em, word-spacing 0.16 em and paragraph spacing 2 em do not clip or overlap content. Use `min-height`, not fixed `height`, on text containers.
- **WCAG 2.5.8 (Target size):** 24×24 CSS px minimum; the app already aims for 44 px on coarse pointers.

Important iOS detail: `-webkit-text-size-adjust:100%` (already present) prevents landscape font inflation, but it can also suppress Safari's `aA` text-size adjustment and Android font boosting. The durable fix is rem-based text; verify `aA` at all five sizes on iOS 15.4 and 18/26 before deciding whether to keep the 100 % rule.

---

## 6. Change plan by area

### 6.1 Phase 1 — remove blockers (small, highest value)

1. **Remove the lookbehind literal.** Rewrite `app.js:3097` with a capture group or a preceding-character check; update the affected tests. This alone turns iOS 15.8 from a static shell into a working app.
2. **Guard startup storage.** Add `readStorage`/`writeStorage` helpers and use them for `state.selectedGroup`, `state.selectedSubgroup`, and the other unguarded top-level reads. Keep the existing `try/catch` style used by `loadSettings`.
3. **Remove `window-controls-overlay`** from `display_override` until titlebar CSS exists. `standalone` remains the effective display mode.
4. **Add `format-detection`** and a correct 180 px `apple-touch-icon`.
5. **Add a CI guard** that fails on `(?<=` / `(?<!` in any shipped JS, so this class of bug cannot return.

Estimated effort: **0.5–1 day**, mostly verification on an iOS 15 device or BrowserStack.

### 6.2 Phase 2 — readable text and zoom (medium)

1. Set `html{font-size:100%}` and make body text `1rem` (16 px).
2. Replace the 169 px text sizes with a small rem scale:
   - meta/caption: `0.8125rem` (13 px) minimum — never 10–11 px;
   - secondary: `0.875rem` (14 px);
   - body: `1rem` (16 px);
   - section titles: `1.125–1.25rem`;
   - page headings: `clamp(1.5rem, 1.2rem + 1vw, 2rem)`.
   Keep px only for borders, icons, shadows and hairlines.
3. Remove `body{font-size:14px}` at ≤360 px; small screens need *larger* relative text, not smaller.
4. Set form controls to `font-size:max(16px, 1em)` at **all** widths (fixes iPad Pro landscape focus zoom).
5. Replace fixed `height` on text-bearing chips/buttons with `min-height`.
6. Test with 200 % text, 400 % page zoom, WCAG text-spacing overrides, and Android/Chrome font-size settings.
7. Fix the `100vw` toast and any element that overflows at 320 px.
8. Add a near-opaque fallback behind every `backdrop-filter` surface.

Estimated effort: **1.5–2 days** plus visual QA. This is the change most likely to move layouts, so do it in one dedicated PR with before/after screenshots at 280/320/360/390/412/768/1024/1366.

### 6.3 Phase 3 — installable PWA and Windows behaviour (small–medium)

1. Generate the icon set: 32 favicon, 180 apple-touch, 192 any, 512 any, 512 maskable (80 % safe zone), 1024 store/social.
2. Compress `logo.png` from 976 KB to a few tens of KB per size; update `og:image` to the 1024 asset.
3. Update `manifest.webmanifest`: `purpose` values, `sizes`, `type`, optional `screenshots` for richer Android install UI.
4. Keep `theme-color`; add a light-scheme variant only if a light theme is approved.
5. Verify installed PWA on:
   - Windows Chrome/Edge: no content under window controls; taskbar icon;
   - Android Chrome: maskable icon, splash colour, standalone;
   - iOS Safari: Add to Home Screen, `apple-touch-icon`, status bar, safe areas;
   - offline launch and update after a version bump.
6. Consider `navigator.storage.persist()` on Chromium and an explicit "install" hint for iOS (no `beforeinstallprompt` there).

Estimated effort: **1 day**.

### 6.4 Phase 4 — payload and runtime performance (medium)

Current uncached payload is roughly:

| Asset | Size |
|---|---|
| `app.js` | 546 KB |
| `brain-*.js` (4 files) | 383 KB |
| `styles.css` | 69 KB |
| exam/notice/room modules | ~150 KB |
| `logo.png` | 976 KB |
| roster + faculty indexes | 660 KB (precached) |

1. Minify JS/CSS at deploy (esbuild/terser) with the same browser target as the support policy.
2. Lazy-load non-critical modules (exam desk, admin, PDF import, brain variants) behind dynamic import with the existing deterministic fallback order intact.
3. Trim the service-worker precache: shell + core brain only; roster/faculty on first use with stale-while-revalidate.
4. Compress the logo and add `width`/`height` to prevent CLS.
5. Use `content-visibility:auto` for long off-screen page sections; keep the chat window virtualised only if measurements justify it.
6. Budget: LCP < 2.5 s on Lighthouse mobile (Moto G Power, slow 4G), CLS < 0.1, INP < 200 ms, initial JS < 300 KB compressed.

Estimated effort: **1.5–2 days**, with measurement before/after.

### 6.5 Phase 5 — automated compatibility harness (medium)

Add a `compat` test project (kept separate from `npm test` so the deterministic unit suite stays fast):

1. **Playwright** projects: Chromium desktop, Firefox desktop, WebKit desktop, Pixel 7 (Chromium), iPhone 13/SE (WebKit), iPad (WebKit), Galaxy Fold 280 px, landscape phone.
2. **Smoke specs** against a mocked `/api/sources`: load → Today renders → Ask Compass answers a fixed verified question → Timetable → Free rooms → Profile lookup → Syllabus → offline reload.
3. **Layout specs:** no horizontal page overflow at 320 px; all pages at 200 % text; inputs ≥16 px on touch; visible focus; no element wider than viewport.
4. **axe-core:** zero critical/serious violations on Today, Timetable, Chat, Profile.
5. **Lighthouse CI** with the budgets above.
6. **Static guards:** `doiuse` or `stylelint-no-unsupported-browser-features` with a browserslist of `chrome >= 109, safari >= 15.4, firefox >= 115, samsung >= 21`; an `es-check`/`eslint-plugin-compat` pass; the lookbehind grep.
7. **Screenshot baselines** per engine at 280/320/390/768/1366/1920.

Estimated effort: **2–3 days** for the first useful suite.

### 6.6 Phase 6 — polish and accessibility (optional, ongoing)

1. Light theme or auto theme for outdoor readability.
2. `@media (max-height: 480px)` landscape tuning beyond the existing chat `compact-chat` class.
3. Screen-reader scripts: NVDA + Chrome/Edge on Windows, TalkBack + Chrome on Android, VoiceOver + Safari on iOS; verify chat announcements, timetable table headers, free-room groups and profile lookup errors.
4. Keyboard-only pass: skip link, nav, chat, dialogs, file import.
5. Foldable/split-screen pass (280 px, 884 px, horizontal segments).
6. Print pass for timetable and syllabus.
7. Consider `prefers-reduced-data` / `navigator.connection.saveData` to skip roster/faculty prefetch on metered connections.

---

## 7. Testing strategy

### 7.1 Automated (every PR)

| Layer | Tool | What it catches |
|---|---|---|
| Syntax floor | lookbehind grep, `es-check`, `eslint-plugin-compat` | C-1 and future parse-time landmines |
| CSS floor | `doiuse` / `stylelint-no-unsupported-browser-features` + browserslist | Unsupported properties without fallbacks |
| Unit/regression | existing `npm test` (325 tests) | Brain, routing, data, free rooms |
| Browser smoke | Playwright Chromium/Firefox/WebKit + device descriptors | Engine-specific JS/CSS failures |
| Accessibility | axe-core | Contrast, labels, roles, landmarks |
| Performance | Lighthouse CI | Payload, LCP, CLS, INP |
| Visual | Playwright screenshots | Zoom/type-scale regressions |

### 7.2 Real devices (release gate, quarterly)

Minimum physical set:

- **iPhone SE (1st gen) on iOS 15.8** — proves the new floor; if unavailable, BrowserStack.
- **iPhone 12/13/14 on current iOS** — Safari + Chrome + Brave smoke.
- **iPad 9th gen** portrait + **iPad Pro 12.9** landscape — input zoom, safe areas, sidebar breakpoint.
- **Budget Android** (Redmi/Realme, 2–3 GB RAM, Android 10–13) — Chrome + WebView, slow network, font size, memory.
- **Samsung Galaxy A** — Samsung Internet, forced dark mode.
- **Pixel/flagship** — Chrome, Brave, Edge, Firefox.
- **Windows laptop 1366×768** — Chrome/Edge/Brave at 100/125/150 %, High Contrast, installed PWA.
- **Windows 11 desktop 1920×1080** — Edge PWA, 200 % zoom.
- **Galaxy Fold or Surface Duo** if available — 280 px folded / split screen.

Use BrowserStack or LambdaTest for the devices you cannot hold; both have free/open-source tiers. Use WebPageTest from an India location for real 3G/4G latency.

### 7.3 Manual scenarios per device

1. First load on slow 4G, then reload offline.
2. Today → Timetable → Free rooms → Chat → Profile → Syllabus → Exams.
3. Ask Compass: a timetable question, a free-room question, an HOD question, a syllabus question, an exam question, an unknown question (must fall back honestly).
4. Focus the chat input and the profile input; confirm no iOS zoom and that the composer stays above the keyboard.
5. Pinch to 500 %, pan, and confirm nav/composer are reachable.
6. Browser text size 200 %, then 400 % page zoom; confirm no clipped content.
7. Rotate to landscape; confirm the chat still works.
8. Install the PWA; relaunch offline; check the icon and splash.
9. Enable High Contrast / reduced motion / increased contrast; confirm readability.
10. Block cookies/storage; confirm the app still boots (C-3).
11. Screen reader: send one question, hear the answer, navigate the timetable table.

### 7.4 Release acceptance

- Tier 1 engines: no console errors, all smoke specs pass.
- 0 horizontal page scroll at 320 px on all pages.
- 0 text below 12 px; body ≥16 px; inputs ≥16 px on touch.
- 200 % text and 400 % reflow: no loss of content or function.
- axe: 0 critical, 0 serious.
- Lighthouse mobile: performance ≥85, accessibility ≥95, best practices ≥95; PWA installable.
- iOS 15.8 device: app loads and answers (C-1 verified).
- Installed Windows PWA: no overlap with window controls (C-4 verified).
- Offline: core pages and the last verified timetable still render.

---

## 8. Sequencing and effort

| Phase | Work | Effort | Risk |
|---|---|---|---|
| 1 | Lookbehind, storage guard, WCO, icons meta, CI grep | 0.5–1 day | Low |
| 2 | rem type scale, input 16 px, 100vw, backdrop fallback, zoom QA | 1.5–2 days | Medium (layout churn) |
| 3 | Icon set, logo compression, manifest, PWA install QA | 1 day | Low |
| 4 | Minify, lazy-load, precache trim, performance budgets | 1.5–2 days | Medium (loading order) |
| 5 | Playwright + axe + Lighthouse + static floor checks | 2–3 days | Low–medium |
| 6 | Light theme, landscape, screen readers, foldables, print | 2–3 days | Low |

Recommended order: **1 → 2 → 3 → 5 → 4 → 6**. Phase 5 before Phase 4 so the performance refactor is protected by tests. Total for Phases 1–5: roughly **7–10 working days**.

---

## 9. Decisions needed

1. **Support floor:** accept iOS 15.4 (remove the lookbehind) or require iOS 16.4? Recommendation: **15.4** — the excluded devices are still in use and the fix is small.
2. **Windows 7/8.1:** keep them in Tier 2 with frozen Chrome/Edge 109 and Firefox 115 ESR, or drop them? Recommendation: keep Tier 2; no extra code is needed once the floor is Chrome 109/FF115.
3. **Typography:** approve a visible type-scale change (body 15 → 16 px, meta 10–11 → 13 px). This will change the look of dense panels; it is the single biggest readability win.
4. **Theme:** keep dark-only, or add an auto/light theme? Recommendation: dark default; add light later if outdoor readability matters.
5. **Fonts:** remove the unused `Inter` name and rely on `system-ui`, or self-host a subsetted Inter woff2? Recommendation: **system-ui** — faster, offline-safe, and already what every device renders today.
6. **Performance investment:** accept a ~2.3 MB first install, or invest 1.5–2 days in minification/lazy-loading? Recommendation: at least compress the logo and minify; it is low risk and high value on budget phones.
7. **Test infrastructure:** add Playwright + axe + Lighthouse to the repo, or keep manual testing? Recommendation: add the harness; C-1 proves manual testing alone misses parse-time failures.

---

## 10. Risks and trade-offs

- **Type-scale churn:** 169 declarations across a 69 KB stylesheet. Do it mechanically, with screenshots at every breakpoint, and keep a revert branch.
- **Lazy-loading the Brain:** must not change answer order or introduce a moment where Ask Compass silently falls back. Keep the deterministic modules synchronous; defer only admin/exam/PDF paths, and test the fallback chain after every split.
- **`text-size-adjust:100%`:** prevents landscape inflation but may suppress user text scaling. Verify `aA` and Android font size before keeping it; rem is the real fix.
- **iOS PWA storage:** Safari can evict script-writable storage after seven days without interaction for non-installed sites; installed PWAs are treated better. Keep the app usable with the last cached timetable and say so honestly.
- **Maskable icons:** without the 80 % safe zone, Android crops the logo. Generate a dedicated maskable asset rather than reusing the 1254 px image.
- **Brave Shields / in-app WebViews:** storage and service workers can be blocked. C-3 and the offline fallback must degrade gracefully; test in Instagram/Facebook in-app browsers if students use those links.
- **"Any version" cannot be guaranteed.** Publish the three-tier policy in the README and show a clear message on Tier 3 rather than a blank screen.

---

## 11. References

- caniuse — regex lookbehind: Safari/iOS 16.4+, Chrome 62+, Firefox 78+; global support 96.91 % (October 2026).
- caniuse — `dvh`/`svh`/`lvh`: Safari/iOS 15.4+, Chrome 108+, Firefox 101+, Samsung Internet 21+.
- caniuse — `crypto.randomUUID`: Safari/iOS 15.4+, Chrome 92+, Firefox 95+.
- caniuse — `requestIdleCallback`: supported in Chromium/Gecko; **disabled by default in Safari/iOS through 27.2**.
- caniuse — `backdrop-filter`: Safari prefixed since 9, unprefixed 18+; Firefox 103+.
- MDN — Regular expression lookbehind assertion; viewport-relative units; `Array.prototype.at`; `crypto.randomUUID`.
- WCAG 2.2 — 1.4.4 Resize Text, 1.4.10 Reflow, 1.4.12 Text Spacing, 2.5.8 Target Size (Minimum).
- Google Chrome Help — current Chrome requires Windows 10+, macOS 13+, Android 10+; Chrome 109 was the last for Windows 7/8.1.
- Apple App Store Review Guidelines — web browsing apps must use WebKit outside the EU (DMA exception in the EU); assume WebKit for all iOS browsers.
- web.dev — viewport units, safe areas, `visualViewport`, installable PWA criteria, maskable icons.

---

## Appendix A — audit evidence

| Check | Result |
|---|---|
| Viewport meta | `width=device-width, initial-scale=1, viewport-fit=cover`; no `user-scalable=no` |
| Font sizes | 169 `px`, 5 `rem`; body 15 px; 14 px at ≤360 px; most common 10–13 px |
| `vh`/`dvh` | 12 `vh` occurrences; `100vh` always followed by `svh`/`dvh` in the shell/chat ladders |
| Safe areas | 43 `env(safe-area-inset-*)` |
| `:has()` | 0 |
| `@supports` | 0 |
| `@container` | 0 |
| `backdrop-filter` | 10 total, 5 `-webkit-` |
| `position: fixed` | 7 |
| `100vw` | 1 (toast) |
| `100vh` | 5 (all inside fallback ladders) |
| Media queries | 280, 360, 480, 560, 600, 860, 1080 max-width; 520 max-height landscape; 1680 min-width |
| UA sniffing | 0 |
| `localStorage` | 64 uses; two unguarded top-level reads at `app.js:90-91` |
| `randomUUID` | 2 uses; fallback present |
| `crypto.subtle` | 1 use; secure-context assumption |
| `requestIdleCallback` | 2 uses; both guarded |
| Lookbehind | 1 regex **literal** at `app.js:3097` |
| `.at()` | 7 uses |
| `??=`/`\|\|=`/`&&=` | 5 uses |
| Icons | one 1254×1254 `purpose:any`; `apple-touch-icon` at 1254; no maskable; logo 976 KB |
| Scripts | 17 synchronous tags; `app.js` 546 KB + brain 383 KB |
| Precache | ≈2.3 MB including roster/faculty/logo |
| Test tooling | no Playwright/Puppeteer/axe/Lighthouse in `package.json` |

## Appendix B — page-by-page checklist

For each of Today, Timetable, Free rooms, Chat, Profile, Syllabus, Exams:

- [ ] 320 px width: no page-level horizontal scroll.
- [ ] 200 % text: no clipped labels, no overlapping controls.
- [ ] 400 % page zoom: all content reachable.
- [ ] Landscape phone: header/composer/nav do not cover content.
- [ ] Touch: targets ≥44 px; no sticky hover.
- [ ] Keyboard: focus visible, logical order, skip link works.
- [ ] Screen reader: headings, table headers, live regions announce.
- [ ] Installed PWA: safe areas, offline reload, correct icon.
- [ ] Storage blocked: app still boots and states what is unavailable.
- [ ] Slow 4G: first interaction within budget; honest loading state.
- [ ] No console errors on Chromium, WebKit, Gecko.
