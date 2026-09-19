    // BEGIN PLANNER UI
    const ROUTE_COLORS = ['#087f68', '#d4572f', '#6555a5'];
    const ROUTE_RUNNER_COLOR = '#ffe066';
    const ROUTE_RUNNER_EDGE = .75;
    const DIFFICULTY_STYLES = [
      { color: '#13834b', label: 'Normal hiking', labelKey: 'planner.difficulty.normal', rank: 0 },
      { color: '#e34e9b', label: 'More demanding hiking', labelKey: 'planner.difficulty.demanding', rank: 1 },
      { color: '#d00000', label: 'Difficult / alpine hiking', labelKey: 'planner.difficulty.difficult', rank: 2 }
    ];
    const WAYPOINT_PIN_PATH = 'M12 1C5.9 1 1 5.8 1 11.7C1 19.5 12 29 12 29S23 19.5 23 11.7C23 5.8 18.1 1 12 1Z';
    let mapMarkersVisible = true;
    const routeRunAnimation = { frame: 0, dots: [] };
    const ROUTE_BACKEND_URL = 'https://trailplanner.vercel.app/api/plan-routes';
    const routing = { selected: null, result: null, visible: new Set(), fingerprint: '', serial: 0, controller: null, worker: null, cache: new Map(), busy: false, searched: false, evidence: '', blockedUntil: 0 };
    const planSwitches = ['loop', 'official-fords', 'harder-hiking'];
    const planFields = ['region', 'order', ...planSwitches, 'date', 'distance', 'radius', 'tolerance', 'roads', 'provider'];
    const providers = {
      coffee: { name: 'Private.coffee', url: 'https://overpass.private.coffee/api/interpreter' },
      vk: { name: 'VK Maps', url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter' },
      fossgis: { name: 'FOSSGIS', url: 'https://overpass-api.de/api/interpreter' }
    };
    const automaticProviderOrder = ['fossgis', 'coffee', 'vk'];
    const regions = {
      hk: ['Hong Kong', 'AFCD hiking guidance', 'https://www.hiking.gov.hk/'],
      tw: ['Taiwan', 'Forestry and Nature Conservation Agency', 'https://recreation.forest.gov.tw/EN/'],
      jp: ['Japan', 'Ministry of the Environment national parks', 'https://www.env.go.jp/en/nature/nps/park/parks/'],
      kr: ['South Korea', 'Korea National Park Service', 'https://english.knps.or.kr/'],
      world: ['Other regions', 'Local trail authority required', null]
    };
    const km = metres => `${(metres / 1000).toFixed(1)} km`;
    const switchEnabled = id => $('plan-' + id).getAttribute('aria-checked') === 'true';
    const loopEnabled = () => switchEnabled('loop');
    const officialFordsEnabled = () => switchEnabled('official-fords');
    const harderHikingEnabled = () => switchEnabled('harder-hiking');
    const routingFingerprint = () => JSON.stringify([state.points, state.segments.length, state.source, ...planFields.map(id => planSwitches.includes(id) ? switchEnabled(id) : $('plan-' + id).value)]);
    const difficultyColorsEnabled = () => $('route-difficulty-colors').getAttribute('aria-checked') === 'true';
    const routeRunEnabled = () => $('route-run').getAttribute('aria-checked') === 'true';
    const sacScaleLabel = scale => scale === 'strolling' ? 'Strolling' : TrailRouter.SAC_SCALES.indexOf(scale) >= 1 ? `T${TrailRouter.SAC_SCALES.indexOf(scale)} · ${scale.replaceAll('_', ' ')}` : 'Difficulty not tagged';
    // UI-only translations. The originals above stay English because they also
    // feed exported GPX file content, which is English by design.
    const sacScaleLabelText = scale => scale === 'strolling' ? t('planner.sacScale.strolling') : TrailRouter.SAC_SCALES.indexOf(scale) >= 1 ? t('planner.sacScale.template', { n: TrailRouter.SAC_SCALES.indexOf(scale), scale: t('planner.sacScale.' + scale) }) : t('planner.sacScale.untagged');
    const routeTitle = route => route.titleKey ? t(route.titleKey) + (route.loopKey ? t('engine.title.loopSuffix') : '') + (route.reversed ? t('engine.title.reversedSuffix') : '') : route.title;
    const routeReason = route => route.reversed ? t(route.loop ? 'engine.reason.reversedLoop' : 'engine.reason.reversedLinear') : route.reasonKey ? t(route.reasonKey, route.reasonVars) + (route.loopKey ? t('engine.reason.loopSuffix') : '') : route.reason;
    function engineProgressText(text, info) {
      if (!info) return text;
      if (info.key === 'engine.progress.search') return t(info.key, { order: t(info.vars.order), profile: t(info.vars.profile) });
      return t(info.key);
    }
    function engineErrorText(error) {
      if (!error?.code) return error?.message || t('planner.error.serviceUnreachable');
      const v = error.vars || {};
      switch (error.code) {
        case 'INCOMPLETE_MAP': return t('routeError.INCOMPLETE_MAP');
        case 'MAP_TOO_LARGE': return t('routeError.MAP_TOO_LARGE');
        case 'NO_ELIGIBLE_NETWORK': return error.vars ? t('routeError.NO_ELIGIBLE_NETWORK', { roadsExcluded: v.roadsExcluded ? t('routeError.noEligibleRoadsSuffix') : '' }) : error.message;
        case 'WAYPOINT_OFF_PATH': return error.vars ? t('routeError.WAYPOINT_OFF_PATH', { n: v.n, maxMetres: v.maxMetres, roadsExcluded: v.roadsExcluded ? t('routeError.offPathRoadsSuffix') : '' }) : error.message;
        case 'INVALID_SETTINGS': return v.infoKey ? t(v.infoKey, v.key ? { key: v.key } : undefined) : error.message;
        case 'INVALID_LOOP': return t('routeError.INVALID_LOOP');
        case 'DISCONNECTED_WAYPOINTS': return error.vars ? (v.loopClose ? t('routeError.disconnectedLoopClose', { n: v.n }) : t('routeError.DISCONNECTED_WAYPOINTS', { a: v.a, b: v.b, fordHint: v.fordHint ? t('routeError.fordHint') : '' })) : error.message;
        case 'NO_TRANSPORT': return error.vars ? t('routeError.NO_TRANSPORT', { noStops: v.noStops ? t('routeError.noTransportNoStops') : '', roles: [v.roleStart ? t('routeError.noTransportRoleStart') : '', v.roleFinish ? t('routeError.noTransportRoleFinish', { n: v.n }) : ''].filter(Boolean).join(t('routeError.noTransportAnd')), km: v.km, unlinked: v.unlinked ? t('routeError.noTransportUnlinked', { count: v.unlinked }) : '', maxReached: v.maxReached ? t('routeError.noTransportMaxReached') : '' }) : error.message;
        case 'ROUTE_LIMITS': return error.vars ? t('routeError.ROUTE_LIMITS', { loopPart: v.loop ? t('routeError.routeLimitsLoop') : '', reasons: (v.reasons || []).map(reason => t(reason.key, reason.vars)).join(t('routeError.limitJoin')) || t('routeError.routeLimitsFallback') }) : error.message;
        case 'AREA_TOO_LARGE': return t('routeError.AREA_TOO_LARGE');
        default: return error.message || t('planner.error.serviceUnreachable');
      }
    }
    function noticeText(info) {
      if (info.key !== 'engine.notice.pinOrderNotKept') return t(info.key);
      const detail = info.detailError?.code ? engineErrorText(info.detailError) : info.detailLimitInfos?.length ? info.detailLimitInfos.map(reason => t(reason.key, reason.vars)).join(t('routeError.limitJoin')) : info.detailFallback ? t('planner.orderedFailed') : '';
      return t(info.key, { detail });
    }
    const noticeTexts = result => result.noticeInfos?.length ? result.noticeInfos.map(noticeText) : (result.notices || []);
    function evidenceText() {
      const info = routing.evidenceInfo;
      if (!info || !routing.result) return routing.evidence;
      const middle = routing.result.settings?.loop ? t('planner.evidence.loop') : t('planner.evidence.stopCandidates', { count: routing.result.stopCount });
      return `${info.source} · ${info.fallback ? `${t('planner.evidence.directFallback')} · ` : ''}${middle}. ${info.officialNote}`;
    }
    function routeDifficultySections(route) {
      const sections = [];
      let section = null;
      for (let i = 0; i + 1 < route.coords.length; i++) {
        const edge = route.edges?.[i], grade = TrailRouter.SAC_SCALES.indexOf(edge?.sacScale), sacScale = grade < 0 ? null : edge.sacScale;
        const style = DIFFICULTY_STYLES[grade <= 1 ? 0 : grade <= 3 ? 1 : 2];
        if (!section || section.sacScale !== sacScale) {
          section = { sacScale, ...style, coords: [route.coords[i]], metres: 0 }; sections.push(section);
        }
        section.coords.push(route.coords[i + 1]); section.metres += edge?.metres ?? TrailRouter.distance(route.coords[i], route.coords[i + 1]);
      }
      return sections;
    }
    function visibleDifficultySections(routes) {
      return routes.flatMap((route, index) => routing.visible.has(route.id) ? routeDifficultySections(route).map(section => ({ ...section, routeId: route.id, routeNumber: index + 1 })) : []).sort((a, b) => a.rank - b.rank);
    }
    function routeAnimationGeometry(route) {
      if (!Array.isArray(route.coords) || route.coords.length < 2) return null;
      const cumulative = [0];
      for (let i = 1; i < route.coords.length; i++) cumulative.push(cumulative.at(-1) + TrailRouter.distance(route.coords[i - 1], route.coords[i]));
      return cumulative.at(-1) > 0 ? { coords: route.coords, cumulative, total: cumulative.at(-1) } : null;
    }
    function pointOnRoute(geometry, progress) {
      const target = (((progress % 1) + 1) % 1) * geometry.total;
      let low = 1, high = geometry.cumulative.length - 1;
      while (low < high) { const middle = (low + high) >> 1; geometry.cumulative[middle] < target ? low = middle + 1 : high = middle; }
      const start = geometry.coords[low - 1], end = geometry.coords[low], segmentStart = geometry.cumulative[low - 1], segmentLength = geometry.cumulative[low] - segmentStart;
      const ratio = segmentLength ? (target - segmentStart) / segmentLength : 0;
      return { lat: start.lat + (end.lat - start.lat) * ratio, lon: start.lon + (end.lon - start.lon) * ratio };
    }
    function stopRouteRun() {
      if (routeRunAnimation.frame) cancelAnimationFrame(routeRunAnimation.frame);
      routeRunAnimation.frame = 0;
      routeRunAnimation.dots.forEach(dot => markers.removeLayer?.(dot));
      routeRunAnimation.dots = [];
    }
    function startRouteRun(routes) {
      if (!map || !routeRunEnabled()) return;
      const runners = routes.flatMap(route => {
        if (!routing.visible.has(route.id)) return [];
        const geometry = routeAnimationGeometry(route);
        if (!geometry) return [];
        const width = routing.selected?.id === route.id ? 7 : 5;
        const dot = L.circleMarker([geometry.coords[0].lat, geometry.coords[0].lon], { radius: (width - ROUTE_RUNNER_EDGE) / 2, stroke: true, color: '#fff', weight: ROUTE_RUNNER_EDGE, opacity: 1, fillColor: ROUTE_RUNNER_COLOR, fillOpacity: 1, interactive: false }).addTo(markers);
        routeRunAnimation.dots.push(dot);
        return [{ dot, geometry, duration: Math.max(8000, Math.min(24000, geometry.total * 9)) / 1.5 }];
      });
      if (!runners.length) return;
      let started;
      const animate = now => {
        started ??= now;
        runners.forEach(runner => { const point = pointOnRoute(runner.geometry, (now - started) / runner.duration); runner.dot.setLatLng([point.lat, point.lon]); });
        routeRunAnimation.frame = requestAnimationFrame(animate);
      };
      routeRunAnimation.frame = requestAnimationFrame(animate);
    }
    function harderTerrainWarning(route) {
      const sections = routeDifficultySections(route).filter(section => TrailRouter.harderThanHiking(section.sacScale));
      if (!sections.length) return '';
      const metres = sections.reduce((sum, section) => sum + section.metres, 0);
      const grades = [...new Set(sections.map(section => section.sacScale))].map(sacScaleLabel).join('; ');
      return `CAUTION: ${Math.ceil(metres)} m tagged harder than hiking (T1): ${grades}. Assess the terrain before going.`;
    }
    function roughSurfaceWarning(route) {
      return route.roughSurfaceMetres > 0 ? `${Math.ceil(route.roughSurfaceMetres)} m has rough-surface vehicle tags. These do not establish hiking difficulty or current foot passability; review the path conditions.` : '';
    }
    // UI-only translated variants; the originals above stay English for GPX export.
    function harderTerrainWarningText(route) {
      const sections = routeDifficultySections(route).filter(section => TrailRouter.harderThanHiking(section.sacScale));
      if (!sections.length) return '';
      const metres = sections.reduce((sum, section) => sum + section.metres, 0);
      const grades = [...new Set(sections.map(section => section.sacScale))].map(sacScaleLabelText).join('; ');
      return t('planner.warning.harderTerrain', { metres: Math.ceil(metres), grades });
    }
    function roughSurfaceWarningText(route) {
      return route.roughSurfaceMetres > 0 ? t('planner.warning.roughSurface', { metres: Math.ceil(route.roughSurfaceMetres) }) : '';
    }
    function activeRegion() {
      const choice = $('plan-region').value; if (choice !== 'auto') return choice;
      const p = state.points[0]; if (!p) return 'world';
      if (p.lat > 22.1 && p.lat < 22.6 && p.lon > 113.8 && p.lon < 114.5) return 'hk';
      if (p.lat > 21.8 && p.lat < 25.5 && p.lon > 119 && p.lon < 122.2) return 'tw';
      if (p.lat > 33 && p.lat < 38.7 && p.lon > 124.5 && p.lon < 131) return 'kr';
      if (p.lat > 24 && p.lat < 46 && p.lon > 122 && p.lon < 146) return 'jp';
      return 'world';
    }
    function stopRouting() { routing.serial++; routing.controller?.abort(); routing.worker?.terminate(); routing.controller = null; routing.worker = null; routing.busy = false; $('cancel-routing').hidden = true; statusFindEnd(); }
    function invalidateRoutes() {
      stopRouting(); routing.selected = null; routing.result = null; routing.visible.clear(); routing.searched = false;
      setRouteRun(false); stopRouteRun();
      setMapMarkersVisible(true);
      $('route-options').replaceChildren(element('div', t('planner.routes.empty'), 'routes-empty'));
      $('route-result-count').textContent = t('planner.routes.noneYet'); $('selected-route-detail').hidden = true; $('route-export-review').hidden = true; $('route-visibility-controls').hidden = true; $('save-all-gpx').disabled = true; $('routing-status').hidden = true;
      $('map-route-toolbar').hidden = true; $('map-route-dots').replaceChildren(); $('map-export-action').disabled = true;
      $('routing-evidence-note').textContent = t('planner.routes.evidenceNote');
      statusSetRoute(null); statusBannerClear();
    }
    function updateGuidance() {
      const n = state.points.length, valid = n > 0 && n <= MAX_WAYPOINTS && (!state.requiresTraceReview || trace.reviewed);
      $('find-routes').disabled = !valid || routing.busy;
      $('find-routes').textContent = routing.busy ? t('planner.find.finding') : t('planner.find.button');
      $('map-route-action').disabled = !valid || routing.busy;
      $('map-route-action').setAttribute('aria-busy', String(routing.busy));
      $('map-route-action').setAttribute('aria-label', routing.busy ? t('planner.find.ariaBusy') : t('planner.find.aria'));
      $('map-route-action').title = routing.busy ? t('planner.find.titleBusy') : t('planner.find.title');
      $('view-inputs').disabled = !n || !map;
      if (routing.selected) {
        $('save-gpx').disabled = false; $('save-gpx').textContent = t('planner.export.saveSelected');
        $('route-export-status').textContent = t('planner.export.reviewSelected');
      } else $('save-gpx').textContent = t('planner.export.saveInput');
      $('save-all-gpx').disabled = !routing.result?.routes?.length;
      updateInputGuide();
    }
    function externalLink(label, href) { const a = element('a', label + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
    function setMapMarkersVisible(visible) {
      mapMarkersVisible = visible;
      const button = $('map-markers-action');
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? t('planner.pins.hideAria') : t('planner.pins.showAria'));
      button.title = visible ? t('planner.pins.hideTitle') : t('planner.pins.showTitle');
    }
    $('map-markers-action').addEventListener('click', () => {
      if (mapMarkersVisible && state.adding) setAdding(false);
      setMapMarkersVisible(!mapMarkersVisible); render(false);
    });
    function showRouteVisibility() {
      const routes = routing.result?.routes || [], controls = $('route-visibility-controls'), items = document.createDocumentFragment(), mapItems = document.createDocumentFragment();
      controls.hidden = !routes.length; $('map-route-toolbar').hidden = !routes.length;
      routes.forEach((route, i) => {
        const button = element('button', t('planner.routes.toggle', { n: i + 1 }), 'route-toggle'); button.type = 'button'; button.style.setProperty('--route-color', ROUTE_COLORS[i]); button.setAttribute('aria-pressed', String(routing.visible.has(route.id)));
        button.addEventListener('click', () => { routing.visible.has(route.id) ? routing.visible.delete(route.id) : routing.visible.add(route.id); showRouteVisibility(); render(false); }); items.append(button);
        const dot = element('button', undefined, 'map-route-dot'); dot.type = 'button'; dot.style.setProperty('--route-color', ROUTE_COLORS[i]); dot.setAttribute('aria-pressed', String(routing.visible.has(route.id))); dot.setAttribute('aria-label', t(routing.visible.has(route.id) ? 'planner.routes.dotAriaHide' : 'planner.routes.dotAriaShow', { n: i + 1, km: km(route.metres) })); dot.title = t('planner.routes.dotTitle', { n: i + 1, km: km(route.metres) });
        dot.append(element('span', String(i + 1), 'map-route-number'), element('small', km(route.metres), 'map-route-length'));
        dot.addEventListener('click', () => { routing.visible.has(route.id) ? routing.visible.delete(route.id) : routing.visible.add(route.id); showRouteVisibility(); render(false); }); mapItems.append(dot);
      });
      $('route-visibility').replaceChildren(items); $('map-route-dots').replaceChildren(mapItems); $('map-export-action').disabled = !routes.some(route => routing.visible.has(route.id));
    }
    function showRoutes() {
      const cards = document.createDocumentFragment();
      routing.result.routes.forEach((route, i) => {
        const card = element('article', undefined, 'route-choice' + (routing.selected?.id === route.id ? ' selected' : ''));
        card.append(element('span', t('planner.routes.option', { n: i + 1 }), 'route-provisional'), element('h3', routeTitle(route)), element('div', km(route.metres), 'route-km'));
        if (route.loop) { const p = element('p', undefined, 'route-stop'); p.append(element('strong', t('planner.routes.startFinishLoop', { name: route.start.name })), element('span', t('planner.routes.loopStop'))); card.append(p); }
        else for (const [labelKey, stop, role] of [['planner.routes.startNear', route.start, 'alight'], ['planner.routes.finishNear', route.end, 'board']]) { const p = element('p', undefined, 'route-stop'); p.append(element('strong', t(labelKey, { name: stop.name })), element('span', [...new Set(stop.services.filter(s => s[role]).map(s => s.ref))].slice(0, 6).join(' / '))); card.append(p); }
        const facts = element('ul', undefined, 'route-facts');
        if (routeReason(route)) facts.append(element('li', routeReason(route)));
        if (!route.loop && (route.start.extendedApproach || route.end.extendedApproach)) facts.append(element('li', t('planner.routes.extendedWalk', { ends: [route.start.extendedApproach ? t('planner.routes.extendedStart') : '', route.end.extendedApproach ? t('planner.routes.extendedFinish') : ''].filter(Boolean).join(t('planner.routes.extendedAnd')) })));
        if (route.fordCrossings?.length) facts.append(element('li', t(route.fordCrossings.length === 1 ? 'planner.routes.fordsOne' : 'planner.routes.fordsMany', { count: route.fordCrossings.length })));
        if (route.harderTerrainMetres > 0) facts.append(element('li', harderTerrainWarningText(route), 'terrain-warning'));
        if (route.roughSurfaceMetres > 0) facts.append(element('li', roughSurfaceWarningText(route)));
        for (const text of [t('planner.routes.allPlaces', { count: state.points.length, order: route.order.map(i => i + 1).join(' → ') }), route.loop ? t('planner.routes.loopLeg', { km: km(route.end.approach) }) : t('planner.routes.approachExit', { approach: km(route.start.approach), exit: km(route.end.approach) }), t('planner.routes.roadsRetraced', { roads: km(route.roadMetres), repeated: km(route.repeatedMetres) })]) facts.append(element('li', text));
        const worstSnap = route.snaps.reduce((worst, snap) => snap.metres > worst.metres ? snap : worst);
        facts.append(worstSnap.metres > 15
          ? element('li', t('planner.routes.worstSnapWarning', { n: worstSnap.index + 1, name: worstSnap.original.name, metres: Math.ceil(worstSnap.metres) }), 'terrain-warning')
          : element('li', t('planner.routes.worstSnap', { metres: Math.ceil(worstSnap.metres) })));
        const select = element('button', routing.selected?.id === route.id ? t('planner.routes.selected') : t('planner.routes.select'), 'route-select primary'); select.addEventListener('click', () => selectRoute(route));
        const save = element('button', t('planner.routes.saveGpx', { n: i + 1 }), 'route-select'); save.addEventListener('click', () => { download(new Blob([plannedGPX(route)], { type: 'application/gpx+xml;charset=utf-8' }), `trailplanner-route-${i + 1}-PROVISIONAL.gpx`); track('gpx_exported'); });
        card.append(facts, select, save); cards.append(card);
      });
      $('route-options').replaceChildren(cards); $('route-result-count').textContent = t('planner.routes.resultCount', { count: routing.result.routes.length });
      $('routing-evidence-note').textContent = `${routing.result.routes.length < 3 ? t('planner.routes.fewerNote') : ''}${noticeTexts(routing.result).join(' ')} ${evidenceText()}`;
      showRouteVisibility();
    }
    function selectRoute(route) {
      routing.selected = route; routing.visible.add(route.id); showRoutes(); routeDetails(); render(); setStage('export', { expand: false }); setDockExpanded(false);
    }
    function routeDetails() {
      const r = routing.selected; if (!r) return;
      const detail = $('selected-route-detail'); detail.hidden = false; detail.replaceChildren(element('h3', `${routeTitle(r)} · ${km(r.metres)}`));
      const grid = element('div', undefined, 'evidence-grid');
      const transport = element('div');
      if (r.loop) transport.append(element('h4', t('planner.details.loopH4')), element('p', t('planner.details.loopText', { name: r.start.name, km: km(r.end.approach) })));
      else {
        transport.append(element('h4', t('planner.details.transportH4')));
        for (const [labelKey, stop, role] of [['planner.details.arrive', r.start, 'alight'], ['planner.details.depart', r.end, 'board']]) {
          const p = element('p'); p.append(element('strong', `${t(labelKey)} ${stop.name}. `), document.createTextNode(t('planner.details.stopText', { km: km(stop.approach), direction: t(labelKey === 'planner.details.arrive' ? 'planner.details.toFirstPin' : 'planner.details.fromLastPin'), extended: stop.extendedApproach ? t('planner.details.extended') : '', gap: Math.ceil(stop.accessGap) })), externalLink(t('planner.details.viewStop'), `https://www.openstreetmap.org/node/${stop.id}`)); transport.append(p);
          const ul = element('ul'); for (const s of stop.services.filter(s => s[role]).slice(0, 8)) { const li = element('li'); li.append(externalLink(`${s.mode} ${s.ref}${s.operator ? ' · ' + s.operator : ''}`, `https://www.openstreetmap.org/relation/${s.id}`)); ul.append(li); } transport.append(ul);
        }
        transport.append(element('p', t('planner.details.checkService', { date: $('plan-date').value || t('planner.details.hikingDateFallback') })));
      }
      const trails = element('div'); trails.append(element('h4', t('planner.details.trailsH4')), element('p', t('planner.details.trailsText', { trail: km(r.trailMetres), unknown: km(r.unknownTerrainMetres) })));
      if (r.harderTerrainMetres > 0) trails.append(element('p', harderTerrainWarningText(r), 'terrain-warning'));
      if (r.roughSurfaceMetres > 0) trails.append(element('p', roughSurfaceWarningText(r)), externalLink(t('planner.details.aboutSmoothness'), 'https://wiki.openstreetmap.org/wiki/Key:smoothness'));
      const regional = regions[activeRegion()]; if (regional[2]) trails.append(externalLink(regional[1], regional[2]));
      if (r.official.length) {
        trails.append(element('p', t('planner.details.afcdMatch', { km: km(r.corridorMetres) })));
        for (const f of r.official.slice(0, 8)) trails.append(element('p', `${f.TRAIL_NAME_EN || t('planner.details.afcdTrail')} · ${f.DIFFICULTY_EN || t('planner.details.difficultyUnknown')}`));
      } else trails.append(element('p', t('planner.details.noOfficial')));
      if (r.fordCrossings?.length) trails.append(element('p', t(r.fordCrossings.length === 1 ? 'planner.details.fordCautionOne' : 'planner.details.fordCautionMany', { count: r.fordCrossings.length })));
      for (const rel of r.relations.slice(0, 6)) { const p = element('p'); p.append(externalLink(rel.name, `https://www.openstreetmap.org/relation/${rel.id}`)); trails.append(p); }
      trails.append(element('p', t('planner.details.osmSnapshot', { timestamp: r.osmTimestamp || t('planner.details.timestampUnavailable') })));
      grid.append(transport, trails); detail.append(grid);
      const wrap = element('div', undefined, 'snap-table-wrap'), table = element('table', undefined, 'snap-table'), headRow = element('tr');
      for (const key of ['planner.details.tableVisit', 'planner.details.tablePlace', 'planner.details.tableInput', 'planner.details.tableRoute', 'planner.details.tableOffset']) headRow.append(element('th', t(key)));
      const head = element('thead'); head.append(headRow); table.append(head);
      const body = element('tbody'); r.order.forEach((index, visit) => { const s = r.snaps[index], row = element('tr'); for (const value of [visit + 1, `${index + 1}. ${s.original.name}`, `${s.original.lat.toFixed(6)}, ${s.original.lon.toFixed(6)}`, `${s.point.lat.toFixed(6)}, ${s.point.lon.toFixed(6)}`, `${Math.ceil(s.metres)} m`]) row.append(element('td', String(value))); body.append(row); }); table.append(body); wrap.append(table); detail.append(wrap);
      $('route-export-review').hidden = false;
    }
    function paintPlannedRoute() {
      stopRouteRun();
      const routes = routing.result?.routes || [];
      const byDifficulty = difficultyColorsEnabled();
      $('route-difficulty-control').hidden = !routes.length;
      $('route-run-control').hidden = !routes.length;
      $('route-difficulty-legend').hidden = !byDifficulty || !routes.some(route => routing.visible.has(route.id));
      if (!routes.length) return;
      if (map) {
        routes.forEach((route, i) => {
          if (!routing.visible.has(route.id)) return;
          const selected = routing.selected?.id === route.id, color = ROUTE_COLORS[i];
          if (!byDifficulty) L.polyline(route.coords.map(p => [p.lat, p.lon]), { color, weight: selected ? 7 : 5, opacity: selected ? 1 : .78 }).bindPopup(t('planner.routes.popup', { n: i + 1, title: routeTitle(route), km: km(route.metres) })).addTo(tracks);
          if (mapMarkersVisible) [route.coords[0], route.coords.at(-1)].forEach((point, endpoint) => { if (!point) return; const letter = endpoint ? 'F' : 'S', offset = (i - 1) * 26, loopEnd = endpoint && TrailRouter.distance(route.coords[0], route.coords.at(-1)) < 1; L.marker([point.lat, point.lon], { interactive: false, icon: L.divIcon({ className: 'route-endpoint-pin', html: `<span style="background:${color}">${letter}</span>`, iconSize: [24, 24], iconAnchor: [12 - offset, loopEnd ? -16 : 12] }), title: t(endpoint ? 'planner.routes.endpointFinish' : 'planner.routes.endpointStart', { n: i + 1 }) }).addTo(markers); });
        });
        // Higher known grades draw last where alternative routes overlap.
        if (byDifficulty) for (const section of visibleDifficultySections(routes)) {
          L.polyline(section.coords.map(p => [p.lat, p.lon]), { color: section.color, weight: routing.selected?.id === section.routeId ? 7 : 5, opacity: 1 })
            .bindPopup(t('planner.routes.popupDifficulty', { n: section.routeNumber, label: t(section.labelKey), sacScale: sacScaleLabelText(section.sacScale), metres: Math.ceil(section.metres) })).addTo(tracks);
        }
        startRouteRun(routes);
      }
      const r = routing.selected; if (!r) { statusSetRoute(t(routes.length === 1 ? 'planner.routes.statusProposedOne' : 'planner.routes.statusProposedMany', { count: routes.length })); return; }
      const routeNumber = routes.findIndex(route => route.id === r.id) + 1;
      statusSetRoute(t('planner.routes.statusSelected', { n: routeNumber, km: km(r.metres), title: routeTitle(r), count: state.points.length }));
      $('track-legend').hidden = true; $('reverse-route').disabled = !r.reversible;
      $('direction-summary').replaceChildren(element('span', t('planner.routes.directionStart', { name: r.start.name })), element('span', t(r.loop ? 'planner.routes.directionEndLoop' : 'planner.routes.directionEnd', { name: r.end.name })), element('span', r.reversible ? t(r.loop ? 'planner.routes.reverseLoop' : 'planner.routes.reverseLinear') : t(r.loop ? 'planner.routes.reverseUnavailableLoop' : 'planner.routes.reverseUnavailableLinear')));
      $('export-note').textContent = t('planner.routes.exportNote', { stops: r.loop ? '' : t('planner.routes.exportNoteStops') });
    }
    async function boundedJSON(url, options, maxBytes = 25 * 1024 * 1024) {
      const response = await fetch(url, options);
      if (!response.ok) {
        const paused = [429, 406].includes(response.status), transient = [502, 503, 504].includes(response.status);
        if (paused) routing.blockedUntil = Date.now() + 30000;
        const error = new Error(t(paused ? 'planner.error.mapPaused' : transient ? 'planner.error.mapTransient' : 'planner.error.mapOther', { status: response.status }));
        error.status = response.status; error.transient = transient; throw error;
      }
      const oversizedMessage = t('planner.error.oversizedMap');
      if (Number(response.headers.get('Content-Length')) > maxBytes) throw new Error(oversizedMessage);
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) throw new Error(oversizedMessage); chunks.push(value); } } catch (e) { await reader.cancel().catch(() => {}); throw e; }
      const buffer = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(buffer));
    }
    function canTryAnotherProvider(error) {
      return error?.transient || ['TimeoutError', 'AbortError'].includes(error?.name) || error instanceof TypeError;
    }
    async function getMapData(box, selected, signal, areas = [], queryOptions = {}) {
      const query = TrailRouter.queryFor(box, areas, queryOptions);
      const choices = selected === 'auto' ? automaticProviderOrder : [selected], failures = [];
      if (signal.aborted) throw new DOMException('Route search cancelled', 'AbortError');
      for (const choice of choices) {
        const provider = providers[choice], entry = provider && routing.cache.get(provider.url + '/' + query);
        if (entry && Date.now() - entry.at <= 600000) return { data: entry.data, provider };
      }
      for (let index = 0; index < choices.length; index++) {
        const provider = providers[choices[index]];
        if (!provider) throw new Error(t('planner.error.chooseProvider'));
        if (signal.aborted) throw new DOMException('Route search cancelled', 'AbortError');
        const providerStatus = t('planner.find.providerStatus', { action: t(index ? 'planner.find.providerTryingBackup' : 'planner.find.providerContacting'), name: provider.name, transport: queryOptions.includeTransport === false ? '' : t('planner.find.providerAndTransport') });
        $('routing-status').textContent = providerStatus; statusFindMilestone(providerStatus);
        const key = provider.url + '/' + query;
        let entry = routing.cache.get(key);
        try {
          if (!entry || Date.now() - entry.at > 600000) {
            const data = await boundedJSON(provider.url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
            entry = { data, at: Date.now() }; routing.cache.set(key, entry);
            while (routing.cache.size > 6) routing.cache.delete(routing.cache.keys().next().value);
          }
          return { data: entry.data, provider };
        } catch (error) {
          if (signal.aborted) throw error;
          failures.push(t('planner.find.providerFailure', { name: provider.name, reason: error?.status || t(['TimeoutError', 'AbortError'].includes(error?.name) ? 'planner.find.failTimeout' : 'planner.find.failNetwork') }));
          if (!canTryAnotherProvider(error) || index === choices.length - 1) {
            if (selected === 'auto' && failures.length > 1 && canTryAnotherProvider(error)) throw new Error(t('planner.error.allProvidersDown', { failures: failures.join('; ') }));
            throw error;
          }
        }
      }
      throw new Error(t('planner.error.noProvider'));
    }
    async function getOfficialTrails(box, signal) {
      if (activeRegion() !== 'hk') return { features: [], note: t('planner.officialNone') };
      const params = new URLSearchParams({ where: '1=1', geometry: `${box[1]},${box[0]},${box[3]},${box[2]}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'TRAIL_NAME_EN,DIFFICULTY_EN,WEBSITE', outSR: '4326', returnGeometry: 'true', f: 'geojson' });
      try { const data = await boundedJSON('https://portal.csdi.gov.hk/server/rest/services/common/afcd_rcd_1665568199103_4360/MapServer/0/query?' + params, { signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) }, 12e6); if (!Array.isArray(data.features) || data.exceededTransferLimit) throw new Error(); return { features: data.features, note: t('planner.officialNote') }; }
      catch (e) { if (signal.aborted) throw e; return { features: [], note: t('planner.officialUnavailable') }; }
    }
    async function getBackendPlan(points, settings, provider, region, signal) {
      const body = JSON.stringify({ points, settings, provider, region });
      let response;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await fetch(ROUTE_BACKEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.any([signal, AbortSignal.timeout(235000)]) });
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          const timedOut = ['TimeoutError', 'AbortError'].includes(error?.name);
          if (timedOut) {
            const failure = new Error(t('planner.error.backendTimeout'));
            failure.directFallback = false; throw failure;
          }
          if (attempt < 3) {
            const retryText = t('planner.error.backendRetry', { attempt: attempt + 1 });
            $('routing-status').textContent = retryText; statusFindMilestone(retryText);
            continue;
          }
          const failure = new Error(t('planner.error.backendFailed'));
          failure.directFallback = false; throw failure;
        }
      }
      let payload = {};
      try { payload = await response.json(); } catch { /* A missing/old backend may return an HTML error page. */ }
      // Old policy can reject newly eligible paths before producing a route.
      // Keep current-policy failures and request/rate/size errors authoritative.
      if (response.status === 422 && response.headers.get('X-TrailPlanner-Route-Policy') !== String(TrailRouter.ROUTING_POLICY_VERSION)) {
        const error = new Error(t('planner.error.policyRejected'));
        error.directFallback = true; throw error;
      }
      if (!response.ok || !Array.isArray(payload.result?.routes)) {
        const error = new Error(payload.error || t('planner.error.backendStatus', { status: response.status }));
        error.status = response.status; if (payload.code) error.code = payload.code; if (payload.vars) error.vars = payload.vars; error.directFallback = [404, 405, 501].includes(response.status); throw error;
      }
      if (payload.result.policyVersion !== TrailRouter.ROUTING_POLICY_VERSION) {
        const error = new Error(t('planner.error.policyDifferent'));
        error.directFallback = true; throw error;
      }
      if (settings.allowHarderHiking && (payload.result.settings?.allowHarderHiking !== true || payload.result.routes.some(route => !Array.isArray(route.edges) || route.edges.length !== route.coords?.length - 1 || route.edges.some(edge => !Object.hasOwn(edge, 'sacScale'))))) {
        const error = new Error(t('planner.error.harderHikingUnsupported'));
        error.directFallback = true; throw error;
      }
      if (settings.loop && (payload.result.settings?.loop !== true || payload.result.routes.some(route => !route.coords?.length || route.start?.id !== route.end?.id || route.coords[0].lat !== route.coords.at(-1).lat || route.coords[0].lon !== route.coords.at(-1).lon))) {
        throw new Error(t('planner.error.notClosedLoop'));
      }
      return payload;
    }
    function workerPlan(data, points, settings, features, serial) {
      return new Promise((resolve, reject) => {
        const code = $('routing-code').textContent + '\nself.onmessage = e => { try { const a=e.data; const result=TrailRouter.plan(a.data,a.points,a.settings,a.features,(text,info)=>self.postMessage({progress:text,info}));self.postMessage({result}); } catch(error) { self.postMessage({error:error.message,code:error.code,vars:error.vars,endpointIndices:error.endpointIndices}); } };';
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        const signal = routing.controller?.signal;
        let worker;
        const cleanup = () => {
          signal?.removeEventListener('abort', abort);
          worker?.terminate();
          if (routing.worker === worker) routing.worker = null;
        };
        const abort = () => { cleanup(); reject(signal?.reason || new DOMException('Route search cancelled', 'AbortError')); };
        try {
          if (signal?.aborted) { abort(); return; }
          worker = new Worker(url); routing.worker = worker;
          signal?.addEventListener('abort', abort, { once: true });
          worker.onmessage = e => {
            if (serial !== routing.serial) { abort(); return; }
            if (e.data.progress) { const progressText = engineProgressText(e.data.progress, e.data.info); $('routing-status').textContent = progressText; statusFindDetail(progressText, serial); }
            else {
              cleanup();
              e.data.error ? reject(Object.assign(new Error(e.data.error), { code: e.data.code, vars: e.data.vars, endpointIndices: e.data.endpointIndices })) : resolve(e.data.result);
            }
          };
          worker.onerror = () => { cleanup(); reject(new Error(t('planner.error.workerFailed'))); };
          worker.postMessage({ data, points, settings, features });
        } catch (error) { cleanup(); reject(error); }
        finally { URL.revokeObjectURL(url); }
      });
    }
    $('find-routes').addEventListener('click', async () => {
      if ($('find-routes').disabled) return;
      if (Date.now() < routing.blockedUntil) { toast(t('planner.find.paused')); return; }
      stopRouting(); setRouteRun(false); stopRouteRun(); const serial = routing.serial, controller = new AbortController(); routing.controller = controller; routing.busy = true; routing.searched = true; routing.selected = null; routing.result = null; routing.visible.clear(); $('selected-route-detail').hidden = true; $('route-export-review').hidden = true; $('route-visibility-controls').hidden = true; clearExport();
      $('cancel-routing').hidden = false; $('routing-status').hidden = false; $('routing-status').textContent = loopEnabled() ? t('planner.find.downloadingLoop') : t('planner.find.downloading');
      statusBannerClear(); statusFindStart(serial, $('routing-status').textContent);
      $('map-route-toolbar').hidden = true; $('map-route-dots').replaceChildren(); $('map-export-action').disabled = true;
      toast(loopEnabled() ? t('planner.find.toastLoop') : t('planner.find.toast'), false, 9000);
      $('route-options').replaceChildren(element('div', loopEnabled() ? t('planner.find.checkingLoop') : t('planner.find.checking'), 'routes-empty')); render(false); setStage('routes', { expand: false });
      const timeout = setTimeout(() => controller.abort(), 245000);
      try {
        const radius = +$('plan-radius').value, box = TrailRouter.boundingBox(state.points, radius);
        const settings = { radius, maxApproach: 1000, maxDistance: +$('plan-distance').value, maxRoad: +$('plan-roads').value, tolerance: +$('plan-tolerance').value, optimize: $('plan-order').value === 'optimize', loop: loopEnabled(), allowOfficialFords: officialFordsEnabled(), allowHarderHiking: harderHikingEnabled() };
        const points = state.points.map(p => ({ ...p }));
        try {
          $('routing-status').textContent = settings.loop ? t('planner.find.checkingLoopStatus') : t('planner.find.checkingStatus'); statusFindMilestone($('routing-status').textContent, serial);
          const planned = await getBackendPlan(points, settings, $('plan-provider').value, activeRegion(), controller.signal);
          if (serial !== routing.serial) return;
          controller.signal.throwIfAborted();
          routing.result = planned.result; routing.evidence = `${planned.source} · ${settings.loop ? 'loop mode: no transport search' : `${routing.result.stopCount} service-linked stop candidates`}. ${planned.officialNote}`; routing.evidenceInfo = { source: planned.source, fallback: false, officialNote: planned.officialNote };
        } catch (backendError) {
          if (!backendError.directFallback) throw backendError;
          $('routing-status').textContent = t('planner.find.localEngine'); statusFindMilestone($('routing-status').textContent, serial);
          const officialPromise = getOfficialTrails(box, controller.signal); officialPromise.catch(() => {});
          let mapData = await getMapData(box, $('plan-provider').value, controller.signal, [], { includeTransport: !settings.loop });
          let official = await officialPromise; if (serial !== routing.serial) return;
          let result, failure;
          try { result = await workerPlan(mapData.data, points, settings, official.features, serial); }
          catch (error) { failure = error; }
          for (const radius of TrailRouter.TRANSPORT_EXPANSION_STEPS) {
            if (result) break;
            const areas = TrailRouter.transportExpansion(points, failure, radius);
            if (!areas.length) throw failure;
            const expansionText = t(settings.loop ? 'planner.find.expansionLoop' : 'planner.find.expansion', { km: radius / 1000 });
            $('routing-status').textContent = expansionText; statusFindMilestone(expansionText, serial);
            [mapData, official] = await Promise.all([
              getMapData(box, $('plan-provider').value, controller.signal, areas),
              getOfficialTrails(TrailRouter.coverageBox(box, areas), controller.signal)
            ]);
            if (serial !== routing.serial) return;
            controller.signal.throwIfAborted();
            try {
              result = await workerPlan(mapData.data, points, { ...settings, radius, maxApproach: radius }, official.features, serial);
              result.transportExpanded = true;
              result.transportExpansionMetres = radius;
            } catch (error) { failure = error; }
          }
          if (!result) throw failure;
          if (serial !== routing.serial) return;
          controller.signal.throwIfAborted();
          routing.result = result;
          routing.evidence = `${mapData.provider.name} / OpenStreetMap · direct fallback · ${settings.loop ? 'loop mode: no transport search' : `${routing.result.stopCount} service-linked stop candidates`}. ${official.note}`; routing.evidenceInfo = { source: `${mapData.provider.name} / OpenStreetMap`, fallback: true, officialNote: official.note };
        }
        if (serial !== routing.serial) return; clearTimeout(timeout);
        routing.result.routes.forEach(route => routing.visible.add(route.id));
        routing.busy = false; $('routing-status').textContent = t('planner.find.foundStatus', { count: routing.result.routes.length }); showRoutes(); render(); setDockExpanded(false); statusCairnCelebrate(); toast(noticeTexts(routing.result)[0] || t(routing.result.routes.length === 1 ? 'planner.find.foundToastOne' : 'planner.find.foundToastMany', { count: routing.result.routes.length }), false, routing.result.notices?.length ? 9000 : 7000);
        $('route-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        if (serial !== routing.serial) return;
        const text = controller.signal.aborted ? t('planner.error.searchTimeout') : engineErrorText(e);
        $('routing-status').textContent = text; $('route-options').replaceChildren(element('div', text, 'routes-empty')); $('route-result-count').textContent = t('planner.find.noQualifying'); statusBannerShow(text, { stage: 'routes' });
      } finally { clearTimeout(timeout); if (serial === routing.serial) { controller.abort(); routing.busy = false; routing.controller = null; $('cancel-routing').hidden = true; statusFindEnd(serial); updateGuidance(); updateDockState(); } }
    });
    $('cancel-routing').addEventListener('click', () => { stopRouting(); statusBannerClear(); $('routing-status').textContent = t('planner.find.cancelled'); $('route-options').replaceChildren(element('div', t('planner.find.cancelledEmpty'), 'routes-empty')); toast(t('planner.find.cancelled')); updateGuidance(); updateDockState(); });
    $('view-inputs').addEventListener('click', () => { routing.selected = null; $('selected-route-detail').hidden = true; $('route-export-review').hidden = true; if (routing.result) showRoutes(); render(); $('map-title').scrollIntoView({ behavior: 'smooth' }); });
    for (const id of planFields) $('plan-' + id).addEventListener('change', () => render(false));
    for (const id of planSwitches) $('plan-' + id).addEventListener('click', () => {
      const control = $('plan-' + id), enabled = !switchEnabled(id);
      control.setAttribute('aria-checked', String(enabled));
      control.querySelector('.switch-state').textContent = enabled ? t('switch.on') : t('switch.off');
      control.dispatchEvent(new Event('change'));
    });
    function toggleDifficultyColors() {
      const control = $('route-difficulty-colors'), enabled = !difficultyColorsEnabled();
      control.setAttribute('aria-checked', String(enabled));
      control.querySelector('.switch-state').textContent = enabled ? t('switch.on') : t('switch.off');
      render(false);
    }
    $('route-difficulty-colors').addEventListener('click', toggleDifficultyColors);
    function setRouteRun(enabled) {
      const control = $('route-run');
      control.setAttribute('aria-checked', String(enabled));
      control.querySelector('.switch-state').textContent = enabled ? t('switch.on') : t('switch.off');
    }
    function toggleRouteRun() { setRouteRun(!routeRunEnabled()); render(false); }
    $('route-run').addEventListener('click', toggleRouteRun);
    const today = new Date(); $('plan-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    function reversePlannedRoute() {
      const r = routing.selected; if (!r || !r.reversible) return;
      r.originalTitle ??= r.title; r.originalReason ??= r.reason;
      r.reversed = !r.reversed;
      [r.start, r.end] = [r.end, r.start]; r.coords.reverse(); r.ids.reverse(); r.edges.reverse();
      // Worker structured cloning preserves shared array references between
      // alternatives. Reversing one option must not mutate another's pin order.
      r.order = r.loop ? [r.order[0], ...r.order.slice(1).reverse()] : [...r.order].reverse();
      if (r.loop) {
        let cursor = 0;
        for (const index of r.order) cursor = r.ids.indexOf(r.snaps[index].id, cursor);
        r.start.approach = 0;
        r.end.approach = r.edges.slice(cursor).reduce((sum, edge) => sum + edge.metres, 0);
      }
      r.preservesOrder = r.order.every((index, visit) => index === visit);
      // Title/reason stay English: they also feed exported GPX file content.
      // The UI displays translated text via routeTitle/routeReason instead.
      r.title = r.reversed ? `${r.originalTitle} · reversed` : r.originalTitle;
      r.reason = r.reversed ? `Reversed by you. Check the new visit order${r.loop ? ' and walking direction' : ', arrival and departure'} below.` : r.originalReason;
      showRoutes(); routeDetails(); render(); toast(t(r.loop ? 'planner.routes.reversedToastLoop' : 'planner.routes.reversedToastLinear'));
    }
    function plannedGPX(r) {
      const fordWarning = r.fordCrossings?.length ? ` CAUTION: ${r.fordCrossings.length} mapped ford crossing${r.fordCrossings.length === 1 ? '' : 's'} on an AFCD trail corridor; check official notices, recent rain and water level before going.` : '';
      const endpoints = r.loop ? `Starts and finishes at waypoint 1 (${r.start.name}); public transport was not searched or required.` : `Start near ${r.start.name} (${km(r.start.approach)} approach, ${Math.ceil(r.start.accessGap)} m unrouted stop gap); end near ${r.end.name} (${km(r.end.approach)} exit, ${Math.ceil(r.end.accessGap)} m gap). Transport approaches prefer 1 km, extending up to 20 km only when needed.`;
      const warning = `PROVISIONAL ROUTE — independently check before navigation. Connected OSM walking ways only; no artificial connectors.${fordWarning} ${harderTerrainWarning(r)} ${roughSurfaceWarning(r)} ${endpoints} Visit order: ${r.order.map(i => i + 1).join(" → ")}. All ${state.points.length} mandatory waypoints visited within the explicitly accepted ${$('plan-tolerance').value} m tolerance. OSM snapshot ${r.osmTimestamp || 'unknown'}. Hiking date ${$('plan-date').value}. Timetables, closures, permits, terrain and management are not automatically verified. OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright. AFCD corridor matches, where available, are approximate. No elevation invented.`;
      const decimal = n => n.toFixed(8), wpts = [{ ...r.coords[0], name: (r.loop ? 'Loop start/finish at ' : 'Start near ') + r.start.name }, ...r.order.map(i => state.points[i]), ...(!r.loop ? [{ ...r.coords.at(-1), name: 'End near ' + r.end.name }] : [])];
      return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TrailPlanner" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlText(r.title)}</name><desc>${xmlText(warning)}</desc><time>${new Date().toISOString()}</time></metadata>${wpts.map(p => `<wpt lat="${decimal(p.lat)}" lon="${decimal(p.lon)}"><name>${xmlText(p.name)}</name></wpt>`).join('')}<trk><name>${xmlText(r.title)} — provisional</name><desc>${xmlText(warning)}</desc><trkseg>${r.coords.map(p => `<trkpt lat="${decimal(p.lat)}" lon="${decimal(p.lon)}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
    }
    function allRoutesGPX(routes) {
      const stamp = new Date().toISOString(), decimal = n => n.toFixed(8), warning = `PROVISIONAL ROUTE OPTIONS — independently check before navigation. Each track uses connected OpenStreetMap walking ways and visits every mandatory waypoint. Timetables, closures, permits, terrain, current access and government management are not automatically verified. OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright. No elevation invented.`;
      const waypoints = state.points.map((p, i) => `<wpt lat="${decimal(p.lat)}" lon="${decimal(p.lon)}"><name>${xmlText(`${i + 1}. ${p.name}`)}</name></wpt>`).join('');
      const tracksXML = routes.map((r, i) => { const option = Number(String(r.id).split('-').at(-1)) || i + 1, fordWarning = r.fordCrossings?.length ? ` CAUTION: ${r.fordCrossings.length} mapped ford crossing${r.fordCrossings.length === 1 ? '' : 's'} on an AFCD trail corridor; check official notices, recent rain and water level.` : '', endpoints = r.loop ? ` Starts and finishes at waypoint 1 (${r.start.name}); public transport was not searched or required.` : ` Start near ${r.start.name} (${km(r.start.approach)} approach; ${Math.ceil(r.start.accessGap)} m unrouted stop gap); end near ${r.end.name} (${km(r.end.approach)} exit; ${Math.ceil(r.end.accessGap)} m unrouted stop gap).`; return `<trk><name>${xmlText(`Route ${option} — ${r.title} — provisional`)}</name><desc>${xmlText(`${warning}${fordWarning} ${harderTerrainWarning(r)} ${roughSurfaceWarning(r)}${endpoints} Visit order ${r.order.map(index => index + 1).join(" → ")}.`)}</desc><trkseg>${r.coords.map(p => `<trkpt lat="${decimal(p.lat)}" lon="${decimal(p.lon)}"></trkpt>`).join('')}</trkseg></trk>`; }).join('');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TrailPlanner" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>TrailPlanner route options</name><desc>${xmlText(warning)}</desc><time>${stamp}</time></metadata>${waypoints}${tracksXML}</gpx>`;
    }
    $('show-all-routes').addEventListener('click', () => { routing.result?.routes.forEach(route => routing.visible.add(route.id)); showRouteVisibility(); render(false); });
    $('hide-all-routes').addEventListener('click', () => { routing.visible.clear(); showRouteVisibility(); render(false); });
    $('map-export-action').addEventListener('click', () => {
      const routes = (routing.result?.routes || []).filter(route => routing.visible.has(route.id)); if (!routes.length) return;
      if (routes.length === 1) { const option = Number(String(routes[0].id).split('-').at(-1)) || 1; download(new Blob([plannedGPX(routes[0])], { type: 'application/gpx+xml;charset=utf-8' }), `trailplanner-route-${option}-PROVISIONAL.gpx`); }
      else download(new Blob([allRoutesGPX(routes)], { type: 'application/gpx+xml;charset=utf-8' }), `trailplanner-${routes.length}-shown-routes-PROVISIONAL.gpx`);
      toast(t(routes.length === 1 ? 'planner.export.shownRoutesOne' : 'planner.export.shownRoutesMany', { count: routes.length })); track('gpx_exported');
    });
    // END PLANNER UI
