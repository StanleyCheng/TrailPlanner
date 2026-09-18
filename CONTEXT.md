# TrailPlanner — Domain Context

## Terms

### Stage
The five-step planning workflow: `method → input → requirements → routes → export`
(stage-ui.js). Steps are numbered for users (Step 2 = the `input` stage).

### Adding mode
Global map state (`state.adding`) in which tapping/clicking empty map space drops a
numbered pin. NOT a property of any stage — it is toggled on/off around the workflow:
- ON automatically at page load (when the map is available).
- ON automatically when entering the `input` stage with the `map-pins` method —
  including re-entry from later stages. No "Start adding pins" click required.
- OFF automatically when leaving the `input` stage.
- The Start/Finish buttons remain as manual pause/resume while on the `input` stage.
- Entering adding mode collapses the control dock to peek so the map is unobstructed.

### Control dock
The bottom sheet holding all planning controls, with peek / half / full snap points.
One shared component on mobile and desktop (deliberate: no separate desktop side panel).
- Desktop peek is minimised: just the slim trail bar (~56–64px), no drag-handle
  strip or status line bulk.
- Full snap is capped at `calc(100dvh - topbar - 16px)` so the dock never slides
  under the top bar on short desktop windows.

### Top bar
In app mode the top bar is fully transparent (no background, blur, or border) to
maximise map visibility. The only visible element is the brand — icon plus
"TrailPlanner" — as a floating opaque pill (paper background, sticker outline)
top-left, overlaying the map.

### Loupe
The circular magnifier (`#pin-loupe`) used for precise pin placement.
- Positioned slightly NW (above-left) of the pointer so the finger/cursor never covers it.
- Shows the live map area *under the pointer*, slightly magnified, with a crosshair
  marking the exact lat/lng where the pin will drop.
- Content must track the pointer continuously as it moves (current bug: the cloned
  map is frozen at its show-time snapshot).
- Triggers: press-and-hold (~200ms) on BOTH touch and desktop mouse, and while
  dragging an existing pin. Plain click/tap still places a pin instantly.
