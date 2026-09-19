    // BEGIN RECOGNITION UI
    const ai = { image: null, controller: null, revision: 0, candidates: [], result: null };
    if (location.hostname === '127.0.0.1' && location.port === '8787') $('ai-endpoint').value = location.origin + '/api/recognize-map';
    else if (location.protocol === 'https:') discoverRecognitionEndpoint();
    async function discoverRecognitionEndpoint() {
      try {
        const url = new URL('/api/recognize-map', location.origin);
        const response = await fetch(url, { method: 'OPTIONS', cache: 'no-store' });
        if (!$('ai-endpoint').value && response.status === 204 && response.headers.get('x-trailcraft-recognition') === '1') {
          $('ai-endpoint').value = url.href;
          updateRecognition();
        }
      } catch {}
    }
    function resetRecognition() {
      ai.revision++; ai.controller?.abort(); ai.controller = null; ai.image = null; ai.result = null; ai.candidates = [];
      $('ai-review').hidden = true; $('ai-results').hidden = true; $('cancel-recognition').hidden = true; $('ai-candidates').replaceChildren();
    }
    function recognitionEndpoint() {
      const raw = $('ai-endpoint').value.trim(); if (!raw) return null;
      const url = new URL(raw); if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api/recognize-map')) throw new Error(t('recognition.endpointPath'));
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && ['localhost', '127.0.0.1'].includes(location.hostname))) throw new Error(t('recognition.endpointHttps'));
      return url;
    }
    function updateRecognition() {
      let endpoint = null; try { endpoint = recognitionEndpoint(); } catch {}
      $('recognize-map').disabled = !ai.image || !endpoint || !!ai.controller;
      $('use-ai-waypoints').disabled = !ai.candidates.some(p => p.included) || !ai.candidates.filter(p => p.included).every(p => p.coordinate);
      updateInputGuide();
    }
    function openRecognition(probe) {
      ai.image = probe; $('ai-review').hidden = false; $('ai-connection').open = !$('ai-endpoint').value;
      $('ai-status').textContent = $('ai-endpoint').value ? t('recognition.readyWithEndpoint') : t('recognition.readyNoEndpoint');
      updateRecognition();
    }
    function displayRecognition(result) {
      ai.result = result; $('ai-results').hidden = false;
      $('ai-area').textContent = result.status === 'not_map' ? t('recognition.notMap') : result.area.name ? t('recognition.suggestedArea', { name: result.area.name }) : t('recognition.locationUnknown');
      const areaEvidence = $('ai-evidence'), hasAreaCoordinate = Number.isFinite(result.area.lat) && Number.isFinite(result.area.lon); areaEvidence.textContent = t('recognition.areaEvidence', { country: result.area.country || t('recognition.countryUncertain'), confidence: result.area.confidence, centre: hasAreaCoordinate ? t('recognition.suggestedCentre', { lat: result.area.lat.toFixed(6), lon: result.area.lon.toFixed(6) }) : '', evidence: result.area.evidence }); if (hasAreaCoordinate) { const areaLink = element('a', t('recognition.checkCentre')); areaLink.href = `https://www.openstreetmap.org/?mlat=${result.area.lat}&mlon=${result.area.lon}#map=14/${result.area.lat}/${result.area.lon}`; areaLink.target = '_blank'; areaLink.rel = 'noopener noreferrer'; areaEvidence.append(' ', areaLink); }
      $('ai-questions').textContent = [...result.warnings, ...result.questions, t('recognition.independentCheck')].join(' ');
      const canvas = $('ai-overlay'), image = ai.image, ratio = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight)); canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio); const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      result.waypoints.forEach((p, i) => { if (p.x == null || p.y == null) return; const x = p.x * canvas.width, y = p.y * canvas.height; ctx.beginPath(); ctx.arc(x, y, 14, 0, 2 * Math.PI); ctx.fillStyle = '#bc4827'; ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(String(i + 1), x, y); });
      ai.candidates = result.waypoints.map(p => ({ ...p, included: false, coordinate: null })); const rows = document.createDocumentFragment();
      ai.candidates.forEach((p, i) => {
        const row = element('div', undefined, 'ai-candidate'), label = element('label', `${i + 1}. ${p.label}`, 'field'), input = document.createElement('input'); input.type = 'text'; input.id = `ai-coordinate-${i}`; input.placeholder = t('recognition.coordinatePlaceholder'); input.value = p.lat != null && p.lon != null ? `${p.lat}, ${p.lon}` : ''; label.htmlFor = input.id;
        const include = element('button', t('recognition.include'), 'candidate-include'); include.type = 'button'; include.setAttribute('aria-pressed', 'false');
        const status = element('p', t('recognition.basisConfidence', { basis: p.basis.replaceAll('_', ' '), confidence: p.confidence, evidence: p.evidence }), 'help'), coordinateStatus = element('p', '', 'help error'); coordinateStatus.setAttribute('aria-live', 'polite'); coordinateStatus.hidden = true; const mapLink = element('a', t('recognition.checkCoordinate'), 'text-button'); mapLink.target = '_blank'; mapLink.rel = 'noopener noreferrer';
        const validate = () => { p.coordinate = null; try { const points = parseCoordinates(input.value); if (points.length === 1) p.coordinate = { ...points[0], name: p.label }; } catch {} coordinateStatus.hidden = !!p.coordinate || (!p.included && !input.value.trim()); coordinateStatus.textContent = input.value.trim() ? t('recognition.coordinateInvalid') : t('recognition.coordinateMissing'); mapLink.hidden = !p.coordinate; if (p.coordinate) mapLink.href = `https://www.openstreetmap.org/?mlat=${p.coordinate.lat}&mlon=${p.coordinate.lon}#map=16/${p.coordinate.lat}/${p.coordinate.lon}`; updateRecognition(); };
        include.addEventListener('click', () => { p.included = !p.included; include.setAttribute('aria-pressed', String(p.included)); include.textContent = p.included ? t('recognition.included') : t('recognition.include'); validate(); }); input.addEventListener('input', validate);
        row.append(label, input, coordinateStatus, status, mapLink, include); rows.append(row); validate();
      });
      if (!ai.candidates.length) rows.append(element('p', t('recognition.noWaypoints'), 'message'));
      $('ai-candidates').replaceChildren(rows); updateRecognition();
    }
    for (const id of ['ai-endpoint', 'ai-access']) $(id).addEventListener('input', updateRecognition);
    $('recognize-map').addEventListener('click', async () => {
      if ($('recognize-map').disabled) return;
      const revision = ++ai.revision, controller = new AbortController(); ai.controller = controller; $('cancel-recognition').hidden = false; $('ai-results').hidden = true; ai.candidates = []; updateRecognition();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {
        const endpoint = recognitionEndpoint(); if (!endpoint) throw new Error(t('recognition.connectFirst'));
        const image = ai.image, scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        // Canvas serialization strips camera metadata before the upload initiated by the Identify button.
        const data = canvas.toDataURL('image/jpeg', .88); if (data.length > 2800000) throw new Error(t('recognition.imageTooDetailed'));
        $('ai-status').textContent = t('recognition.reading', { host: endpoint.host });
        const headers = { 'Content-Type': 'application/json' }; if ($('ai-access').value) headers.Authorization = 'Bearer ' + $('ai-access').value;
        const response = await fetch(endpoint.href, { method: 'POST', headers, signal: controller.signal, body: JSON.stringify({ image: data, context: $('ai-context').value, consent: true }) });
        const body = await response.json(); if (revision !== ai.revision) return;
        if (!response.ok) throw new Error(body.error || t('recognition.serverStatus', { status: response.status }));
        if (!body.result || !Array.isArray(body.result.waypoints) || body.result.waypoints.length > MAX_WAYPOINTS || !body.result.area || !Array.isArray(body.result.warnings) || !Array.isArray(body.result.questions)) throw new Error(t('recognition.invalidResult'));
        displayRecognition(body.result); $('ai-status').textContent = t('recognition.finished');
      } catch (e) { if (revision === ai.revision) $('ai-status').textContent = controller.signal.aborted ? t('recognition.cancelled') : e.message || t('recognition.unavailable'); }
      finally { clearTimeout(timeout); if (revision === ai.revision) { ai.controller = null; $('cancel-recognition').hidden = true; updateRecognition(); } }
    });
    $('cancel-recognition').addEventListener('click', () => ai.controller?.abort());
    $('use-ai-waypoints').addEventListener('click', () => {
      if ($('use-ai-waypoints').disabled || !ai.candidates.some(p => p.included) || !ai.candidates.filter(p => p.included).every(p => p.coordinate)) return;
      replaceDraft(ai.candidates.filter(p => p.included).map(p => ({ ...p.coordinate })), [], 'User-selected Kimi image waypoints'); message(t('recognition.placesAdded')); $('route-builder').scrollIntoView({ behavior: 'smooth' });
    });
    // END RECOGNITION UI
