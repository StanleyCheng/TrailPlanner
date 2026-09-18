# TrailPlanner Design System — "Trail Buddy"

The reference for anyone (human or AI) modifying this UI. Spec-level decisions live in `UI_REDESIGN_PLAN.md`; this document is the standing rulebook. Audience: future engineers and agents — keep it current when the UI changes.

## Principles

1. **Map-first.** Chrome never permanently shrinks the map. Controls borrow space (sheet snap points) and give it back (auto-peek); nothing docks permanently except the ~64px trail bar. The top bar is fully transparent — only the brand floats over the map as an opaque sticker pill top-left (`pointer-events:none` on the bar, `auto` on the pill).
2. **Split voice.** Playful visuals and microcopy for navigation, empty states, waiting and success. **Straight, precise voice for errors, safety notices, evidence and export disclaimers.** The mascot (cairn) appears only at loading/success — never with bad news. Users learn: when the app stops joking, pay attention.
3. **Honest progress.** Only true signals: elapsed time, retry counts, timeout/pause states. Never fabricate server phases ("Snapping pins…" is a lie — the route API is a single POST). Waiting-framed flavor ("Still walking the map… 47s") is allowed **for Find only**.
4. **One status voice.** The trail bar's status line is the single source of truth for what's happening. No competing status surfaces.

## Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--pine` / `--ink` | `#263e35` | Outlines, text, sticker shadow |
| `--paper` | `#f7f6f0` | App background |
| `--cream` | `#fffdf4` | Sticker fill |
| `--sunny` | `#ffd23f` | Highlights, badges, current-step |
| `--accent` | `#bc4827` | Primary action, warnings accent |
| `--sky` | `#7ec4e8` | Info, transport cues |
| `--trail-green` | `#3e9e5f` | Success, completed steps |
| `--danger` | `#a52a25` | Error banner (straight voice) |

### Shape & depth

- `--sticker-outline: 2px solid var(--pine)` — everything clickable looks stuck-on.
- `--radius-sticker: 14px` (12–16px range across components).
- `--shadow-sticker: 3px 3px 0 var(--pine)` — hard offset shadow, no blur. Pressed state collapses to `1px 1px 0` with `translate(2px,2px)`.

### Typography

- `--font-display: 'Fredoka', var(--font)` — display, step labels, buttons, chips. Rounded and chunky; this is the cute voice.
- `--font: 'DM Sans', sans-serif` — body copy, forms, dense information.
- `--display` (DM Serif Display) is **retired** — removed from the Google Fonts link and `:root`; every display usage is `--font-display`.

### Foundation utility classes (additive; consume these, don't reinvent)

- `.sticker` — cream fill + outline + radius + hard shadow.
- `.sticker-btn` — sticker + 44px min-height + Fredoka 600 + press-down active state.
- `.sticker-chip` — small pill variant (32px min-height).

## Components

### Trail bar (always visible)

Bottom bar (minimized on desktop: 12px grip, compact status line), ~91px measured on mobile (navigation row + live status line, plus a subline row while a search runs) + `env(safe-area-inset-bottom)` as **padding-bottom** (targets clear the home indicator). Layout: **icon-only Back** (`←`, 44×44pt, slot reserved with `visibility:hidden` on step 1) | **bootprint stepper** | **Next / primary action**. The status line lives in the bar. Step name/number goes in the status line, never in the button row. Next labels shorten at ≤380px.

### Status subline + banner

- **Subline** (`#status-subline`): appears while a Find runs (and during the success cameo). Holds the non-live elapsed ticker, the **Cancel** chip, and the cairn. Hidden otherwise.
- **Error banner** (`#status-banner`): persistent, docked above the bar, danger fill with ink outline, straight voice. `role="alert"` on insertion only; tap opens the relevant step, × dismisses. One at a time.

### Cairn mascot

Small inline-SVG stacked-stone character (`#cairn`, ~28px: cream/sky/sunny stones, pine outlines, tiny smile). Exactly two moments: **Find busy** — hops beside the subline ticker; **search success** — flag-planted cameo for ~1.6s, once. Never with errors, banners, failures, or safety copy (`cairnVisible()` in the status reducer enforces banner-wins; `tests/status-state.test.cjs` pins it). Static under `prefers-reduced-motion`.

### Sheet snap points

- **peek** = bar only · **half** ≈ 45% viewport · **full** ≈ 88% viewport, capped 16px below the top bar so the sheet never slides under it.
- Measured from `visualViewport.height` **at gesture start** (never read dvh mid-drag); animate via `transform: translateY`, never height.
- Drag from the **handle zone only** (`touch-action:none` + pointer capture). Content scrolls natively (`pan-y`); horizontal card scrollers claim their own gestures (`overscroll-behavior-x:contain`).
- Map tap while half/full → auto-peek. Pin-adding mode locks at peek.
- **JS snap settling must not depend on `transitionend`** (breaks under reduced-motion).

### Bootprint stepper

Dashed trail line with 5 alternating bootprints. Prints are 24–28px visuals inside **44px-tall hit areas**. States: completed (filled, trail green) / current (bouncing flag, sunny) / locked (greyed). Pattern: `nav`-style button group with `aria-current="step"`; Arrow/Home/End keyboard nav; locked steps stay **focusable** with `aria-disabled="true"` and explain their unlock condition via the status line.

### Loupe (pin placement)

Circular ~120px magnifier floating just NW (above-left) of the pointer — clamped to the viewport, never under the finger/cursor (flips SE near the top-left corner). **CSS 2× magnification of the live map pane** — no second map instance, no extra tile requests. Crosshair marks the pin tip's ground point (the coordinate is the teardrop tip, not the icon center). Entries: press-and-hold ~200ms to place (touch, mouse, and pen) and dragging an existing pin (touch). iOS: suppress callout/selection on the map (`-webkit-touch-callout:none; user-select:none`) and `preventDefault` contextmenu during the gesture.

### Status tiers (strict ownership)

| Tier | Surface | ARIA | Content |
| --- | --- | --- | --- |
| Live status line | trail bar | `aria-live="polite"`, `aria-atomic="true"` | Idle context, Find **milestones** (start / retry n of 3 / done), selected-route summary. Elapsed-seconds ticker lives in a **non-live** node — no per-second announcements. |
| Toast | floating, above banner/bar | `polite` | Transient confirmations only. Never errors. |
| Error banner | persistent, above bar | `role="alert"` **on insertion only** | Errors, one at a time, straight voice, persists until resolved/replaced. |

## Motion

- Springy snaps ~240ms; press-down 120ms.
- **Every** animation is gated by `prefers-reduced-motion` — sheet snap becomes instant, flag/cairn static, no entrance animations, `scroll-behavior:smooth` disabled.
- New keyframes must be added to the reduced-motion media block; `tests/ui-integrity.test.cjs` pins exact substrings of that block — update the pin deliberately in the same commit.

## Voice rules

- **Playful:** stage intros (`.stage-intro`), help text (`.help`), pin instructions, empty states, toasts, Find waiting/success, cairn moments.
- **Straight (do not touch):** the full verbatim inventory is in `UI_REDESIGN_PLAN.md` §6 — export review block, ford disclosures, provisional-route wording (incl. GPX strings and `-PROVISIONAL.gpx` filenames), routing failure messages, transport caveats, recognition/privacy consent, reversal warnings, guidance safety principles (en + zh-Hant), analytics consent.
- Acceptance test: flavor and cairn attach to Find waiting/success only — never to route summaries, failures, or notices.

## Accessibility minimums

- 44×44pt targets everywhere (stepper exception: 44pt-tall hit areas on 24–28px visuals).
- Focus relocation: programmatic sheet collapse moves focus to the drag handle; keyboard-initiated expand focuses the current step's first control; availability changes relocate focus explicitly.
- No per-second live-region updates; milestones only.
- New form inputs inherit `font-size:16px` at ≤720px (prevents iOS focus zoom).
