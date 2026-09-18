    // BEGIN STAGE UI
    // BEGIN STAGE MODEL
    function stageAvailability(model) {
      return {
        method: true,
        input: !!model.method,
        requirements: model.pointCount > 0,
        routes: !!(model.routingBusy || model.routingSearched || model.routeCount),
        export: !!(model.pointCount || model.segmentCount || model.hasImage)
      };
    }
    function stageLockedReason(stage, model) {
      if (stageAvailability(model)[stage]) return null;
      if (stage === 'input') return 'Choose how you want to add places first.';
      if (stage === 'requirements') return 'Add at least one place first.';
      if (stage === 'routes') return 'Set your places, then use Find.';
      if (stage === 'export') return 'Add at least one place or file first.';
      return null;
    }
    function stageNavTarget(order, available, current, direction) {
      const index = order.indexOf(current);
      const span = direction < 0 ? order.slice(0, index) : order.slice(index + 1);
      const reachable = span.filter(stage => available[stage]);
      return (direction < 0 ? reachable.at(-1) : reachable[0]) || null;
    }
    function stageNextAction(stage) {
      return { method: 'continue', input: 'review', requirements: 'find', routes: 'export' }[stage] || null;
    }
    // END STAGE MODEL
    const stageOrder = ['method', 'input', 'requirements', 'routes', 'export'];
    const stageNames = { method: 'Adding Pins', input: 'Add Points', requirements: 'Requirements', routes: 'Routes', export: 'Export' };
    const inputNames = { 'map-pins': 'Map pins', coordinates: 'Coordinates', text: 'TXT / CSV', gpx: 'GPX file', 'map-image': 'Route image', image: 'Map photo' };
    const nextLabels = { continue: ['Continue →', 'Continue →'], review: ['Review waypoints →', 'Review →'], find: ['Find routes', 'Find'], export: ['Export →', 'Export →'] };
    let currentStage = 'method';
    function stageModel() {
      return { method: $('input-method').value, pointCount: state.points.length, segmentCount: state.segments.length, hasImage: !!state.imageUrl, routingBusy: routing.busy, routingSearched: routing.searched, routeCount: routing.result?.routes.length || 0 };
    }
    function availableStages() {
      return stageAvailability(stageModel());
    }
    // #bar-status is owned solely by the status reducer (lib/status-ui.js).
    // Sheet controller: peek / half / full snap points positioned with translateY.
    // Snap state is settled in JS only — never via transitionend (reduced-motion strips transitions).
    const sheet = { snap: 'peek', locked: false, y: 0, heights: { peek: 120, half: 320, full: 640 }, reduced: matchMedia('(prefers-reduced-motion: reduce)') };
    const narrowBar = matchMedia('(max-width: 380px)');
    function viewportHeight() { return Math.round(window.visualViewport?.height || window.innerHeight); }
    function snapOffset(snap) { return Math.max(0, sheet.heights.full - sheet.heights[snap]); }
    function applySnap(animate = true) {
      const dock = $('control-dock');
      sheet.y = Math.max(0, Math.min(snapOffset('peek'), sheet.y));
      dock.classList.toggle('dragging', !animate || sheet.reduced.matches);
      dock.style.transform = `translate(-50%, ${sheet.y}px)`;
      const banner = $('status-banner'), bannerHeight = banner && !banner.hidden ? banner.offsetHeight : 0;
      document.documentElement.style.setProperty('--dock-visible-height', `${Math.ceil(sheet.heights.full - sheet.y + bannerHeight)}px`);
    }
    function measureSheet() {
      const view = viewportHeight();
      sheet.heights.full = Math.round(view * 0.88);
      sheet.heights.half = Math.round(view * 0.45);
      const bar = $('trail-bar-shell').getBoundingClientRect().height;
      if (bar > 40) sheet.heights.peek = Math.round(bar);
      $('control-dock').style.height = sheet.heights.full + 'px';
      sheet.y = snapOffset(sheet.snap);
      applySnap(false);
    }
    function setSnap(snap) {
      if (sheet.locked && snap === 'full') snap = 'half';
      sheet.snap = snap;
      sheet.y = snapOffset(snap);
      applySnap(true);
      $('control-dock').classList.toggle('snap-peek', snap === 'peek');
      const toggle = $('control-dock-toggle');
      toggle.setAttribute('aria-expanded', String(snap !== 'peek'));
      toggle.setAttribute('aria-label', `${snap === 'peek' ? 'Open' : 'Minimize'} planning controls — ${stageNames[currentStage]}`);
    }
    function sheetSetLocked(locked) {
      sheet.locked = locked;
      $('control-dock').classList.toggle('sheet-locked', locked);
      if (locked) setSnap('peek');
    }
    function sheetAutoPeek() {
      if (sheet.snap !== 'peek') setSnap('peek');
    }
    function focusStageControl(stage) {
      ($('stage-' + stage) || $('stage-tab-' + stage))?.focus({ preventScroll: true });
    }
    function setDockExpanded(expanded, focus = false) {
      setSnap(expanded ? 'half' : 'peek');
      if (focus && expanded) focusStageControl(currentStage);
      if (!expanded && $('control-dock').contains(document.activeElement)) $('control-dock-toggle').focus({ preventScroll: true });
    }
    function setStage(stage, { expand = true, focus = false } = {}) {
      if (!availableStages()[stage]) return;
      if (stage !== 'input' && state.adding) setAdding(false);
      currentStage = stage;
      updateDockState();
      $('control-dock-body').scrollTop = 0;
      if (expand) setSnap('half');
      if (focus) $('stage-tab-' + stage).focus({ preventScroll: true });
    }
    function setNextLabel(action) {
      $('stage-next').textContent = action ? nextLabels[action][narrowBar.matches ? 1 : 0] : '';
    }
    let wasRoutingBusy = false;
    function updateDockState() {
      const model = stageModel(), available = stageAvailability(model);
      if (!available[currentStage]) {
        const previous = currentStage;
        currentStage = available.input ? 'input' : 'method';
        if (previous !== currentStage && document.activeElement?.closest?.('.trail-steps')) $('stage-tab-' + currentStage).focus({ preventScroll: true });
      }
      const currentIndex = stageOrder.indexOf(currentStage), inputLabel = inputNames[model.method] || stageNames.input;
      for (const stage of stageOrder) {
        const button = $('stage-tab-' + stage), selected = currentStage === stage, locked = !available[stage];
        button.classList.toggle('locked', locked);
        button.classList.toggle('done', !selected && !locked && stageOrder.indexOf(stage) < currentIndex);
        button.setAttribute('aria-disabled', String(locked));
        if (selected) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
        button.tabIndex = selected ? 0 : -1;
        const name = stage === 'input' ? inputLabel : stageNames[stage];
        button.setAttribute('aria-label', `Step ${stageOrder.indexOf(stage) + 1} · ${name}${locked ? ' · locked' : ''}`);
        $('stage-' + stage).hidden = !selected;
      }
      $('input-stage-title').textContent = inputLabel;
      $('manual-trace-tools').hidden = !['map-image', 'image'].includes(model.method) || !trace.bitmap;
      $('route-builder').hidden = !available.requirements;
      $('route-results').hidden = !available.routes;
      $('dock-map-controls').hidden = !available.export;
      const back = $('stage-back');
      back.style.visibility = currentStage === 'method' ? 'hidden' : 'visible';
      const next = $('stage-next'), action = stageNextAction(currentStage);
      next.hidden = !action;
      setNextLabel(action);
      next.disabled = action === 'continue' ? !available.input : action === 'review' ? !available.requirements : action === 'find' ? $('find-routes').disabled : !routing.result?.routes.length;
      statusSetStep(`Step ${currentIndex + 1} of 5 · ${currentStage === 'input' ? inputLabel : stageNames[currentStage]}`);
      $('route-details-button').hidden = !routing.selected;
      if (wasRoutingBusy && !routing.busy && routing.result?.routes?.length) setSnap('half');
      wasRoutingBusy = routing.busy;
    }
    function activateStage(stage, { focus = false } = {}) {
      const reason = stageLockedReason(stage, stageModel());
      if (reason) { statusSetNotice(`${stageNames[stage]} is locked — ${reason}`); return; }
      setStage(stage, { focus });
    }
    for (const stage of stageOrder) $('stage-tab-' + stage).addEventListener('click', () => activateStage(stage));
    document.querySelector('.trail-steps').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const from = stageOrder.indexOf(document.activeElement?.dataset?.stage || currentStage);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? stageOrder.length - 1 : (from + (event.key === 'ArrowRight' ? 1 : -1) + stageOrder.length) % stageOrder.length;
      const stage = stageOrder[index];
      $('stage-tab-' + stage).focus({ preventScroll: true });
      activateStage(stage, { focus: true });
    });
    narrowBar.addEventListener?.('change', () => setNextLabel(stageNextAction(currentStage)));
    new MutationObserver(() => { if (currentStage === 'requirements') updateDockState(); }).observe($('find-routes'), { attributes: true, attributeFilter: ['disabled'] });
    // Native horizontal scrolling preserves trackpad momentum and touch gestures.
    // Keyboard browsing only applies to the row itself, never its action buttons.
    const routeOptions = $('route-options');
    routeOptions.addEventListener('keydown', event => {
      if (event.target !== routeOptions || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const cards = [...routeOptions.querySelectorAll('.route-choice')];
      if (!cards.length) return;
      const rowLeft = routeOptions.getBoundingClientRect().left;
      const positions = cards.map(card => card.getBoundingClientRect().left - rowLeft + routeOptions.scrollLeft - 2);
      const current = routeOptions.scrollLeft;
      const left = event.key === 'Home' ? 0 : event.key === 'End' ? routeOptions.scrollWidth : event.key === 'ArrowRight'
        ? positions.find(position => position > current + 2) ?? routeOptions.scrollWidth
        : positions.findLast(position => position < current - 2) ?? 0;
      event.preventDefault();
      routeOptions.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
    $('stage-back').addEventListener('click', () => {
      const target = stageNavTarget(stageOrder, availableStages(), currentStage, -1);
      if (target) setStage(target);
    });
    $('stage-next').addEventListener('click', () => {
      if ($('stage-next').disabled) return;
      const action = stageNextAction(currentStage);
      if (action === 'find') { $('find-routes').click(); return; }
      const target = { continue: 'input', review: 'requirements', export: 'export' }[action];
      if (target) setStage(target);
    });
    // Sheet drag: handle zone only, pointer capture, flick-aware. Tap toggles peek ↔ half.
    const dockToggle = $('control-dock-toggle');
    let sheetDrag = null, suppressToggleClick = false;
    dockToggle.addEventListener('pointerdown', event => {
      measureSheet();
      sheetDrag = { id: event.pointerId, startY: event.clientY, startSheetY: sheet.y, time: event.timeStamp, moved: false };
      dockToggle.setPointerCapture(event.pointerId);
    });
    dockToggle.addEventListener('pointermove', event => {
      if (!sheetDrag || event.pointerId !== sheetDrag.id) return;
      const delta = event.clientY - sheetDrag.startY;
      if (Math.abs(delta) > 5) sheetDrag.moved = true;
      if (!sheetDrag.moved) return;
      sheet.y = Math.max(0, Math.min(snapOffset('peek'), sheetDrag.startSheetY + delta));
      applySnap(false);
    });
    function endSheetDrag(event) {
      if (!sheetDrag || event.pointerId !== sheetDrag.id) return;
      const delta = event.clientY - sheetDrag.startY, elapsed = Math.max(event.timeStamp - sheetDrag.time, 1), moved = sheetDrag.moved;
      sheetDrag = null;
      if (!moved) return;
      suppressToggleClick = true;
      setTimeout(() => { suppressToggleClick = false; }, 0);
      const velocity = delta / elapsed;
      let target = sheet.snap;
      if (velocity > 0.4) target = sheet.y > snapOffset('half') ? 'peek' : 'half';
      else if (velocity < -0.4) target = sheet.y < snapOffset('half') ? 'full' : 'half';
      else target = ['peek', 'half', 'full'].map(name => [name, snapOffset(name)]).sort((a, b) => Math.abs(a[1] - sheet.y) - Math.abs(b[1] - sheet.y))[0][0];
      setSnap(target);
      if (target === 'peek' && $('control-dock').contains(document.activeElement)) dockToggle.focus({ preventScroll: true });
    }
    dockToggle.addEventListener('pointerup', endSheetDrag);
    dockToggle.addEventListener('pointercancel', endSheetDrag);
    dockToggle.addEventListener('click', () => {
      if (suppressToggleClick) return;
      if (sheet.snap === 'peek') { setSnap('half'); focusStageControl(currentStage); }
      else setSnap('peek');
    });
    window.addEventListener('resize', measureSheet);
    window.visualViewport?.addEventListener('resize', measureSheet);
    if (document.fonts?.ready) document.fonts.ready.then(() => measureSheet());
    function revealControl(id) {
      const target = $(id), stage = target?.closest('.stage-panel');
      if (stage) setStage(stage.id.replace('stage-', ''));
      const details = target?.closest('details'); if (details) details.open = true;
      if (target?.closest('#route-details-dialog') && !$('route-details-dialog').open) $('route-details-dialog').showModal();
    }
    $('control-dock').addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const target = $(link.getAttribute('href').slice(1));
      if (target) { event.preventDefault(); revealControl(target.id); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    $('route-details-button').addEventListener('click', () => $('route-details-dialog').showModal());
    $('close-route-details').addEventListener('click', () => $('route-details-dialog').close());
    // Keep processing feedback above the dock, without restoring information cards inside it.
    for (const id of ['ai-status', 'photo-status', 'trace-message']) {
      new MutationObserver(() => {
        const node = $(id);
        if (!node.textContent.trim() || currentStage !== 'input' || $('stage-input').hidden) return;
        if (node.classList.contains('error')) statusBannerShow(node.textContent, { stage: 'input' });
        else toast(node.textContent, false, 7000);
      }).observe($(id), { childList: true, characterData: true, subtree: true });
    }
    measureSheet();
    setSnap('peek');
    updateDockState();
    // END STAGE UI
