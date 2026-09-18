// BEGIN LOUPE UI
    // BEGIN LOUPE STATE
    const LOUPE_ARM_MS = 200, LOUPE_SLOP_PX = 10;
    function loupeGestureInitial() { return { phase: 'idle', pointerId: null, startX: 0, startY: 0 }; }
    // Pure hold-to-place / pin-drag gesture arbitration. Events:
    // { type: 'down'|'move'|'up'|'cancel'|'timer'|'dragstart'|'drag'|'dragend',
    //   x, y, pointerId, pointerType, button, adding, onMarker }
    // Hold-to-place arms for touch, mouse and pen; non-touch pointers must use the primary button.
    // Returns { gesture, effects } where effects are DOM instructions:
    // place-pin, disable-handlers, show-loupe, move-pin, update-loupe,
    // commit-pin, restore-handlers, suppress-click, hide-loupe.
    function loupeGestureReduce(gesture, event) {
      const idle = () => ({ gesture: loupeGestureInitial(), effects: [] });
      const stay = () => ({ gesture, effects: [] });
      if (event.type === 'down') {
        // A second finger while armed means pinch: commit and hand control back to the map.
        if (gesture.phase === 'armed') return { gesture: loupeGestureInitial(), effects: ['commit-pin', 'restore-handlers', 'hide-loupe'] };
        if (gesture.phase === 'pending') return idle();
        if (gesture.phase !== 'idle') return stay();
        if (!['touch', 'mouse', 'pen'].includes(event.pointerType) || !event.adding || event.onMarker) return stay();
        if (event.pointerType !== 'touch' && (event.button ?? 0) !== 0) return stay(); // no right/middle-click placement
        return { gesture: { phase: 'pending', pointerId: event.pointerId, startX: event.x, startY: event.y }, effects: [] };
      }
      if (event.type === 'dragstart') {
        // Pin drags show the loupe for every pointer type, for the drag duration only.
        if (gesture.phase !== 'idle') return stay();
        return { gesture: { ...loupeGestureInitial(), phase: 'pin-drag' }, effects: ['show-loupe'] };
      }
      if (gesture.phase === 'pin-drag') {
        if (event.type === 'drag') return { gesture, effects: ['update-loupe'] };
        if (event.type === 'dragend') return { gesture: loupeGestureInitial(), effects: ['hide-loupe'] };
        return stay();
      }
      if (gesture.phase === 'pending') {
        if (event.pointerId !== gesture.pointerId) return stay();
        if (event.type === 'timer') return { gesture: { ...gesture, phase: 'armed' }, effects: ['place-pin', 'disable-handlers', 'show-loupe'] };
        if (event.type === 'move') return Math.hypot(event.x - gesture.startX, event.y - gesture.startY) > LOUPE_SLOP_PX ? { gesture: { ...gesture, phase: 'panning' }, effects: [] } : stay();
        if (event.type === 'up' || event.type === 'cancel') return idle(); // quick tap: click-to-place fires unchanged
        return stay();
      }
      if (gesture.phase === 'panning') {
        if ((event.type === 'up' || event.type === 'cancel') && event.pointerId === gesture.pointerId) return idle();
        return stay();
      }
      if (gesture.phase === 'armed') {
        if (event.pointerId !== gesture.pointerId) return stay();
        if (event.type === 'move') return { gesture, effects: ['move-pin', 'update-loupe'] };
        if (event.type === 'up') return { gesture: loupeGestureInitial(), effects: ['commit-pin', 'restore-handlers', 'suppress-click', 'hide-loupe'] };
        if (event.type === 'cancel') return { gesture: loupeGestureInitial(), effects: ['commit-pin', 'restore-handlers', 'hide-loupe'] };
        return stay();
      }
      return stay();
    }
    // END LOUPE STATE
    const LOUPE_RADIUS = 60, LOUPE_SCALE = 1.2, LOUPE_LIFT = 10, LOUPE_OFFSET_X = 10;
    let loupeMap = null, loupeEl = null, loupeMag = null;
    let loupeGesture = loupeGestureInitial(), loupeArmTimer = 0, loupeSuppressTimer = 0;
    let loupeSuppressClick = false, loupeHandlersDisabled = false, loupeRefreshFrame = 0;
    let loupeDraggedMarker = null, loupeDraggedIndex = -1, loupeDownLatLng = null, loupePendingLatLng = null, loupeLastPointerType = 'mouse';
    function loupeConsumeClickSuppression() { const was = loupeSuppressClick; loupeSuppressClick = false; clearTimeout(loupeSuppressTimer); return was; }
    function loupeRefreshContent() {
      if (!loupeMap || !loupeMag) return;
      const pane = loupeMap.getPane('tilePane'); if (!pane) return;
      loupeMag.replaceChildren(pane.cloneNode(true));
      const size = loupeMap.getSize(); loupeMag.style.width = size.x + 'px'; loupeMag.style.height = size.y + 'px';
    }
    function loupeScheduleRefresh() {
      if (!loupeEl || loupeEl.hidden || loupeRefreshFrame) return;
      loupeRefreshFrame = requestAnimationFrame(() => { loupeRefreshFrame = 0; loupeRefreshContent(); });
    }
    function loupePlace(latlng) {
      if (!latlng || !loupeEl || loupeEl.hidden) return;
      const pt = loupeMap.latLngToContainerPoint(latlng);
      loupeMag.style.left = (LOUPE_RADIUS - LOUPE_SCALE * pt.x) + 'px';
      loupeMag.style.top = (LOUPE_RADIUS - LOUPE_SCALE * pt.y) + 'px';
      const rect = loupeMap.getContainer().getBoundingClientRect(), cx = rect.left + pt.x, cy = rect.top + pt.y, size = LOUPE_RADIUS * 2;
      // Default NW of the pointer so the finger/cursor never covers the disc; flip SE when NW won't fit.
      let left = cx - size - LOUPE_OFFSET_X, top = cy - LOUPE_LIFT - size;
      if (top < 8 || left < 8) { left = cx + LOUPE_OFFSET_X; top = cy + LOUPE_LIFT; }
      left = Math.min(Math.max(left, 8), window.innerWidth - size - 8);
      top = Math.min(Math.max(top, 8), window.innerHeight - size - 8);
      // Clamping must never slide the disc over the pointer: push a covering axis to the far side.
      if (cx >= left && cx <= left + size) {
        const alt = Math.min(Math.max(left <= cx - LOUPE_OFFSET_X ? cx + LOUPE_OFFSET_X : cx - size - LOUPE_OFFSET_X, 8), window.innerWidth - size - 8);
        if (!(cx >= alt && cx <= alt + size)) left = alt;
      }
      if (cy >= top && cy <= top + size) {
        const alt = Math.min(Math.max(top <= cy - LOUPE_LIFT ? cy + LOUPE_LIFT : cy - LOUPE_LIFT - size, 8), window.innerHeight - size - 8);
        if (!(cy >= alt && cy <= alt + size)) top = alt;
      }
      loupeEl.style.left = Math.round(left) + 'px';
      loupeEl.style.top = Math.round(top) + 'px';
    }
    function loupeShow(latlng) { if (!latlng || !loupeEl) return; loupeEl.hidden = false; loupeRefreshContent(); loupePlace(latlng); }
    function loupeHide() { if (loupeEl) loupeEl.hidden = true; loupeDraggedMarker = null; loupeDraggedIndex = -1; }
    function loupeApplyEffects(effects, domEvent) {
      for (const effect of effects) {
        if (effect === 'place-pin') {
          // Drop at the latest pointer position, not the stale press point: jitter can pan the map before the arm timer fires.
          const dropAt = loupePendingLatLng || loupeDownLatLng;
          if (!dropAt) continue;
          addMapPinAt(dropAt);
          const layers = markers.getLayers();
          loupeDraggedMarker = layers[layers.length - 1] || null;
          loupeDraggedIndex = state.points.length - 1;
        } else if (effect === 'disable-handlers') {
          loupeMap.dragging?.disable(); loupeMap.tapHold?.disable(); loupeHandlersDisabled = true;
        } else if (effect === 'restore-handlers') {
          if (loupeHandlersDisabled) { loupeMap.dragging?.enable(); loupeMap.tapHold?.enable(); loupeHandlersDisabled = false; }
        } else if (effect === 'show-loupe') {
          loupeShow(loupeDraggedMarker ? loupeDraggedMarker.getLatLng() : null);
        } else if (effect === 'move-pin') {
          if (loupeDraggedMarker && domEvent) loupeDraggedMarker.setLatLng(loupeMap.mouseEventToLatLng(domEvent));
        } else if (effect === 'update-loupe') {
          loupePlace(loupeDraggedMarker ? loupeDraggedMarker.getLatLng() : null);
        } else if (effect === 'commit-pin') {
          // Only the hold-to-place flow commits here; existing-pin drags commit through their own dragend handler.
          if (loupeDraggedMarker && loupeDraggedIndex >= 0 && state.points[loupeDraggedIndex]) {
            const moved = loupeDraggedMarker.getLatLng().wrap(), i = loupeDraggedIndex;
            mutateWaypoints(() => { state.points[i] = { ...state.points[i], lat: moved.lat, lon: moved.lng, manual: true }; state.source = 'Edited waypoints'; });
          }
          loupeDraggedMarker = null; loupeDraggedIndex = -1;
        } else if (effect === 'suppress-click') {
          loupeSuppressClick = true;
          clearTimeout(loupeSuppressTimer); loupeSuppressTimer = setTimeout(() => { loupeSuppressClick = false; }, 600);
        } else if (effect === 'hide-loupe') {
          loupeHide();
        }
      }
    }
    function loupeApplyEvent(event, domEvent) {
      const wasPending = loupeGesture.phase === 'pending';
      const result = loupeGestureReduce(loupeGesture, event);
      loupeGesture = result.gesture;
      if (wasPending && loupeGesture.phase !== 'pending') clearTimeout(loupeArmTimer);
      loupeApplyEffects(result.effects, domEvent);
    }
    function initLoupe(mapInstance) {
      if (loupeMap) return;
      loupeMap = mapInstance; loupeEl = $('pin-loupe'); loupeMag = loupeEl.querySelector('.loupe-magnifier');
      const container = loupeMap.getContainer();
      container.addEventListener('pointerdown', event => {
        loupeLastPointerType = event.pointerType;
        if (!event.isPrimary && loupeGesture.phase === 'idle') return;
        loupeDownLatLng = event.isPrimary ? loupeMap.mouseEventToLatLng(event) : loupeDownLatLng;
        if (event.isPrimary) loupePendingLatLng = null;
        loupeApplyEvent({ type: 'down', x: event.clientX, y: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType, button: event.button, adding: !!state.adding, onMarker: !!event.target.closest('.leaflet-marker-icon') }, event);
        if (loupeGesture.phase === 'pending') loupeArmTimer = setTimeout(() => loupeApplyEvent({ type: 'timer', pointerId: event.pointerId }), LOUPE_ARM_MS);
      });
      container.addEventListener('pointermove', event => {
        if (!['pending', 'panning', 'armed'].includes(loupeGesture.phase)) return;
        loupePendingLatLng = loupeMap.mouseEventToLatLng(event);
        loupeApplyEvent({ type: 'move', x: event.clientX, y: event.clientY, pointerId: event.pointerId }, event);
      });
      const releaseHandler = event => {
        if (loupeGesture.phase === 'idle' || loupeGesture.phase === 'pin-drag') return;
        loupeApplyEvent({ type: event.type === 'pointerup' ? 'up' : 'cancel', pointerId: event.pointerId }, event);
      };
      // Window-level too: releasing off the map while armed must still commit and restore handlers.
      for (const type of ['pointerup', 'pointercancel']) { container.addEventListener(type, releaseHandler); window.addEventListener(type, releaseHandler); }
      // iOS long-press callout would kill hold-to-place; pin right-click removal is a marker handler and stays.
      container.addEventListener('contextmenu', event => { if (state.adding && !event.target.closest('.number-pin')) event.preventDefault(); });
      loupeMap.on('move zoomend tileload load', loupeScheduleRefresh);
    }
    function loupeBindMarker(marker) {
      marker.on('dragstart', () => { loupeDraggedMarker = marker; loupeDraggedIndex = -1; loupeApplyEvent({ type: 'dragstart', pointerType: loupeLastPointerType }); });
      marker.on('drag', () => loupeApplyEvent({ type: 'drag' }));
      marker.on('dragend', () => loupeApplyEvent({ type: 'dragend' }));
    }
// END LOUPE UI
