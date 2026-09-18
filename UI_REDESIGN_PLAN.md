# TrailPlanner UI/UX Redesign Plan — "Trail Buddy"

Mobile-first redesign (reference device: **iPhone 16 Pro Max**, 440×956 pt). Goals: maximize map area, make step navigation obvious (always know which step, easy forward/back), keep the user continuously informed, and replace the muted field-journal look with a cute sticker-book identity — without weakening safety-critical trust.

*Revised after three deep-dive reviews (feasibility, UX/a11y, consistency). Their findings are folded in below.*

## 1. Settled decisions (from grilling session)

1. **Single interaction model, bottom sheet.** No desktop side panel; one model scales from phone to desktop.
2. **Persistent "trail bar" navigation.** Back | bootprint stepper (step position + name) | Next. Next absorbs each step's primary action. Map's circular Find button **stays** as a redundant control (on trial).
3. **Sheet snap points: peek / half / full.** Drag between them; tapping the map auto-peeks; **pin-adding mode locks the sheet at peek**.
4. **Personality dial 2: cute chrome, split voice.** Playful visuals/microcopy for navigation, empty states, success, waiting. **Straight, precise voice for errors, safety notices, evidence, export disclaimers.** Mascot (a cairn) appears only at loading/success, never with bad news.
5. **Theme A: sticker-book / scout badges.** Thick ink outlines, chunky rounded controls, pine/yellow/orange/sky palette (keep ink `#263e35` + burnt orange `#bc4827`), Fredoka display font, bootprint stepper, cairn mascot.
6. **Pin-placement loupe.** Touch-only circular magnifier floating above the finger, showing the pin **tip's ground point** under a crosshair. Entry points: hold-200ms-to-place fluid gesture, and dragging any existing pin.
7. **Centralized 3-tier status.** (i) live status line in the always-visible bar, (ii) transient toasts, (iii) persistent error banner above the bar (straight voice). Header pill deleted; its duties absorbed by the bar.
8. **Honest progress only.** Find narration uses true signals: elapsed seconds, retry attempts, timeout/pause states, ceiling context. No fabricated server phases; waiting-framed flavor allowed **for Find only** ("Still walking the map… 47s").
9. Process: author `DESIGN.md`; deliberately rewrite stale test assertions (never delete safety tests); sub-agent implementation lanes; `npm test` + `npm run build` gates; agent-browser visual QA at 440×956pt.

## 2. Layout architecture

### 2.1 Trail bar (always visible, resting state) — *fit-corrected after a11y review*

The bar is ~64px + `env(safe-area-inset-bottom)` (inset applied as **padding-bottom** so targets clear the home indicator). Five tappable prints + labeled Back/Next **cannot** fit 440pt at compliant sizes, so:

- **Back: icon-only** `←` (44×44pt, `aria-label="Back"`). Slot is **reserved with `visibility:hidden`** on step 1 so prints never shift position between steps.
- **Bootprint stepper:** prints are 24–28px visuals inside **44px-tall hit areas** (~36–40pt wide each, iOS segmented-control compromise). Completed = filled, current = bouncing flag (static under reduced-motion), locked = greyed. Prints tappable for **unlocked** steps only.
- **Step name/number lives in the status line**, not the bar row: "Step 3 of 5 · Requirements — set your limits". Never competes with targets.
- **Next labels shorten at ≤380px** ("Review waypoints →" → "Review →"; "Find routes" → "Find"), reusing the existing 380px breakpoint.
- Right: **Next / primary action** per stage: `Continue →` (1) · `Review waypoints →` (2) · `Find routes` (3, triggers Find + busy state) · `Export →` (4) · hidden on 5. Note this **inverts** today's `next.hidden` logic on stage 3 (deliberate).
- Sticker style: cream fill, 2px ink outline, rounded 16px top.

### 2.2 Sheet (peek / half / full)

- Snap points: **peek** = bar only (~64px+safe area) · **half** ≈ 45% viewport · **full** ≈ 88% viewport. **Measured in JS from `visualViewport.height` at gesture start** (dvh shifts when iOS chrome collapses — never read dvh mid-drag). Animate via `transform: translateY` (compositor), not height.
- Drag from the **handle zone only**: `touch-action:none` + `setPointerCapture`; flick velocity snaps to nearest point. **No "drag from anywhere when scrolled to top"** — it hijacks route-card gestures.
- Gesture containment: `.dock-body` `touch-action:pan-y`; sheet drag ignores gestures starting inside scrollable content; `.route-options` keeps `overscroll-behavior-x:contain` and gets `touch-action:pan-x pan-y`.
- `--dock-visible-height` updates **continuously during drag** (existing ResizeObserver mechanism extended; Leaflet bottom controls, toast, and the error banner all key off it).
- Snap settling must **not depend on `transitionend`** (breaks when transitions are stripped under reduced-motion) — settle state in JS timers/rAF.
- Map tap while half/full → animate to peek. Pin-adding mode locks at peek (handle tap → half is allowed; map interaction re-locks).
- **Sheet-state transitions for auto-Find** (reviewer catch): moving a pin auto-clicks Find after 320ms; Find must **release the peek-lock**; results land at **half**; re-lock only when adding re-arms.
- **Focus management:** on programmatic collapse/auto-peek, move focus to the drag handle (`aria-expanded`); on keyboard-initiated expand, focus the current step's first control; when availability changes the current stage, relocate focus explicitly.
- Skip link (`#control-dock-toggle`) and Escape focus target must keep working — the handle keeps that id or the link is re-pointed.
- Re-curation of CSS-hidden copy is restricted to `.help` / `.stage-intro` / `.pin-instructions` / converter intros. **Notices stay verbatim** (`.review-notice`, `.export-note`, `.direction-summary`, `.map-guidance` safety items).

### 2.3 Map chrome (right-hand toolbar)

Keep existing controls and ids: Find circle (`#map-route-action`, on trial), route dots toolbar (DOM order `map-route-dots < route-difficulty-control < route-run-control < map-markers-action` is pinned by tests — preserve), Export. Restyle as stickers. Switches must keep `role="switch"`, `aria-checked`, `.switch-state` markup exactly (pinned by `loop-ui` / `official-ford-ui` tests).

### 2.4 What leaves the map

- Header status pill (`#map-caption` / `#map-count`) **deleted — but only after** its four live writers (`render()`, `paintPlannedRoute()`, `route-run` wiring) are re-routed through the new status-line reducer. Migration order matters: reducer first, deletion last.
- Absorbed strings **keep safety wording verbatim**: selected-route summary = `Route {n} · {km} · provisional · all {N} mandatory places` (the "provisional" and mandatory-places affirmations are pinned by the rewritten `route-run.test.cjs`).
- Topbar becomes **brand-only** (no second desktop status — that would re-split the single source of truth).

## 3. Step model & ARIA

Stages and availability rules stay exactly as in `lib/stage-ui.js` (`stageAvailability`, 5-key shape, `// BEGIN/END STAGE MODEL` markers kept **byte-identical** — tests slice on them).

- Pattern: **`nav`-style group of buttons with `aria-current="step"`** (tablist semantics don't expect sibling Back/Next; if tablist were retained, Back/Next would have to sit outside it). Prints keep Arrow/Home/End keyboard navigation and roving tabindex.
- Locked steps: `aria-disabled="true"` but **focusable** (discoverable); activation explains the unlock condition in the status line ("Add at least one place first").
- Guidance merge (`lib/guidance-ui.js`): **merge, don't remove.** Keep `guideStateFor`, the bilingual en/zh-Hant prompts, and "Why these steps matter" safety principles — they become in-sheet content at half/full. Remove the parallel "step 1/4" counter and the `guide-action`/`guide-secondary` buttons; their actions fold into the bar's Next. Keep `// BEGIN/END GUIDANCE STATE` markers and `const guideCopy = ` slicing delimiters exactly (tests depend on them, incl. 4-space indent).

## 4. Loupe (pin placement & drag) — *redesigned after review*

**Implementation: CSS magnification of the live map pane — no second Leaflet instance.** The original "second map at zoom+2" idea fails two ways: tiles/map are `maxZoom:19` (z20/z21 don't exist → blank loupe), and +2 zoom means a fresh, uncached tile pyramid per placement (extra requests against OSM tile policy, bad on reduced-data).

- Loupe = circular ~120px viewport rendering the main map's tile pane **scaled 2× via CSS transform**, centered on the pin tip's ground point. Zero extra tile requests, no attribution complication (same page-level attribution), works at any zoom.
- Crosshair + center dot on the tip's ground point; loupe positioned ~100px above the touch point, clamped to viewport with 8px margins. `touch-action:none`, no interactions.
- **Gesture arbitration (new code, touch-only):**
  - In adding mode: on touch pointerdown, suppress `map.dragging` and `map.tapHold` (map is created with `tapHold:true` — long-press currently fires a synthetic `contextmenu`).
  - Hold ~200ms without moving → pin appears and drag arms; slide adjusts with live loupe; release commits via the existing `dragend`/`mutateWaypoints` path.
  - **Suppress the release `click`** or the existing `map.on('click')` handler adds a second pin at the release point.
  - Quick tap (no hold) → existing click-to-place, unchanged.
  - Dragging an existing pin → loupe for the drag duration.
- iOS callout suppression on `#map` at least in adding mode: `-webkit-touch-callout:none; user-select:none; -webkit-tap-highlight-color:transparent` + `preventDefault` on `contextmenu` (200ms arm is safely under iOS's ~500ms long-press).
- Reduced-motion: no scale/bounce on show/hide. Reduced-data: loupe is free by construction (no fetches).

## 5. Status system (3 tiers) — *live-region ownership policy after review*

1. **Bar status line** — sole owner of idle context, Find narration, selected-route summary. `aria-live="polite"`, `aria-atomic="true"`. **Announce milestones only** (start, retry n of 3, success, failure); the elapsed-seconds ticker lives in a **non-live** visual text node (per-second updates in a live region = announcement storms).
2. **Toasts** — transient confirmations only, polite. **Remove the assertive flip** in `toast()`; errors no longer route here. Existing double-announcements (`toast($('routing-status').textContent)`) are de-duplicated: the status line owns the text.
3. **Error banner** — sole owner of errors, one at a time, docked above the bar (included in `--dock-visible-height` accounting). `role="alert"` **only on insertion**; subsequent text mutations stay polite. Persistent until resolved/replaced (mirrors today's semantics). **All `toast(x, true, …)` call sites reroute here.**
- `#routing-status`, `#input-message`, `#guide-prompt` remain visible text but lose `role="status"`/`aria-live` where the bar/banner owns the event (visual mirrors, no double AT announcements). The MutationObserver mirror re-points to the bar status line, not toast.
- Find busy: bar primary button shows spinner + elapsed (non-live); cairn hops beside the status line (static under reduced-motion); map Find circle keeps its RGB cycle during its trial. Cancel affordance: `#cancel-routing` must be reachable from the bar during busy.
- Stale-run guard: the status reducer ignores late updates via the existing `routing.serial` pattern.
- **Acceptance criterion (tested): flavor and cairn attach to Find waiting/success only** — never to selected-route summaries, failures, or notices.

## 6. Visual identity (authored into `DESIGN.md`)

- Tokens: pine `#263e35` (ink/outline), cream `#fffdf4` (sticker fill), sunny yellow `#ffd23f`, burnt orange `#bc4827`, sky `#7ec4e8`, trail green `#3e9e5f`, danger `#a52a25`. 2px ink outlines, 12–16px radii, hard offset shadows.
- Type: **Fredoka** (display/steps/buttons) + **DM Sans** (body). Fredoka must be **added** to the Google Fonts link (currently only DM Sans + DM Serif Display; DM Serif Display is retired).
- Cairn mascot: inline SVG stacked-stone character, Find + success moments only.
- Motion: springy snaps ~240ms; **all** motion gated by `prefers-reduced-motion` — including sheet snap (becomes instant), toast/banner entrances, and the currently-ungated `html{scroll-behavior:smooth}`. New keyframes join the existing reduced-motion media block; the pinned test string is rewritten in the same commit.
- Microcopy split-voice pass: playful `.help`/`.stage-intro`/empty states; the **do-not-touch straight-voice inventory** (verbatim, from consistency review):
  - `#route-export-review` block incl. `#route-export-status` ("These review reminders are not a safety certification.")
  - Ford disclosures (`planner-ui.js:174,215` "Turn back if conditions are unsafe."; GPX `CAUTION` strings `:493/:502`)
  - Provisional wording (`README.md:3`; `planner-ui.js:247`; GPX "PROVISIONAL ROUTE…" `:495/:500`; `-PROVISIONAL.gpx` filenames `:509–510`; guidance `notes.selected` en + zh-Hant)
  - Routing failures (`planner-ui.js:390,445–446,449` + pass-through engine/API messages)
  - Transport caveats (`planner-ui.js:173,494,502,214,217`; `routing-evidence-note`)
  - Recognition/privacy consent (`#ai-upload-notice`, candidates notice, `photo-gps-warning`, guidance `identify-image`/`waiting-recognition`)
  - Reversal (`direction-summary`, reversal toast)
  - Guidance safety principles (`guide-official/transit/connections/privacy`, both languages); analytics consent copy

## 7. Explicit non-goals / invariants

- No changes to: routing engine, route APIs, Overpass/AFCD usage, privacy model, export review gates, loop/ford/reversal **logic _and_ disclosure wording**, recognition consent flow, analytics consent.
- Safety-behavior tests must keep passing or be strengthened; structure assertions may be rewritten to the new truth.
- Desktop remains fully functional (same model, sheet centered ≤560px wide).
- No formatter over `lib/` — three test suites slice sources on literal markers/indentation. Markers byte-identical; `npm run build` in every lane gate.

## 8. Test impact (verified inventory)

- `ui-integrity.test.cjs`: exact CSS strings to rewrite — dock-grip `↓/↑` (`:127`), reduced-motion block (`:125`), Find circle CSS/markup/keyframe strings (`:119–124`), plus `find-routes` disabled-guard (`:52`) which must survive verbatim wherever Next-absorbs-Find lands. Required ids preserved: `control-dock, map-pins-panel, map-route-action, map-route-toolbar, map-route-dots, map-export-action, route-visibility, show-all-routes, hide-all-routes, save-all-gpx, guide-title, guide-language, guide-list` (+ `guide-action`/`guide-secondary` — update if merged away). `lib/`↔`index.html` inline-fragment exact-match: rebuild after every lib edit.
- `route-run.test.cjs`: `:71` pins the `#map-caption` textContent line → rewritten against the status-line reducer keeping "provisional · all N mandatory places"; `:92` pins find-routes listener body; `:33` pins toolbar DOM order.
- `planner-backend-retry.test.cjs`: pins `/Retrying \(3 of 3\)/` + exactly 2 toast calls during retry — narration rewrite must preserve or deliberately update.
- `stage-state.test.cjs`: `// BEGIN/END STAGE MODEL` markers + 5-key shape.
- `guidance-state.test.cjs`: `GUIDANCE STATE` markers, `guideCopy` delimiters, 16 actions × 2 languages × 4 steps.
- `loop-ui` / `official-ford-ui`: switch markup pins (`role="switch"`, `aria-checked`, `.switch-state`, label ids).
- New tests: stepper nav model (back/next/jump/locked-explain), loupe gesture state machine (pure logic), status-line reducer (milestones vs ticker, stale-serial guard, flavor-only-at-Find).

## 9. Implementation lanes (sub-agents; I coordinate)

- **Lane 0 (first, sequential):** `DESIGN.md` + tokens + Fredoka + sticker component classes.
- **Lane A:** sheet snap physics (translateY/visualViewport/no-transitionend) + trail bar + bootprint stepper + Back/Next model + guidance merge (`lib/stage-ui.js` rewrite + dock markup/CSS).
- **Lane B:** loupe (CSS-magnify component + gesture arbitration).
- **Lane C:** status system (status-line reducer, error banner + toast reroute, live-region ownership, Find narration, header-pill migration-then-deletion).
- **Lane D:** split-voice microcopy pass (bounded by the §6 inventory) + cairn SVG + README/doc updates (7 stale statements identified: minimized-handle description, status-beside-logo, header route label, hidden-instructions, failures-above-panel, panel-scroll wording, Find RGB trial note).
- Gates after each lane: `npm test && npm run build`. Final: agent-browser visual QA (440×956pt) — every step, all snap points, loupe active, Find busy + cancel, error banner, reduced-motion, zh-Hant guidance, analytics-consent overlap, 360pt fallback — for user review.

## 10. Risks (updated after review)

1. **Gesture arbitration bugs** (double pin on release-click; tapHold phantom contextmenu) — spec'd in §4; covered by new loupe state-machine tests + manual QA script.
2. **Bar fit on 360pt devices** — corrected in §2.1 (icon-only Back, print hit areas, shortened labels); verified in QA at 360pt.
3. **Live-region announcement storms** — ownership policy §5; reducer test enforces milestones-only.
4. **Auto-Find vs peek-lock** — explicit sheet-state transitions §2.2.
5. **Build-marker fragility** — no formatters, markers byte-identical, build in every gate.
6. **Find-circle redundancy confusion** — trial as agreed; evaluate in QA (keep or drop).
7. **iOS dvh instability mid-drag** — visualViewport measurement + translateY only.
