    // BEGIN STATUS UI
    // BEGIN STATUS STATE
    // Waiting-framed flavor is allowed for Find narration only (plan §1 decision 8).
    // Every other tier must pass through statusBarText verbatim.
    function statusFindTicker(seconds) {
      return `Still walking the map… ${seconds}s · usually 10–40s, limit 4 min`;
    }
    // Ticker carries the per-second elapsed time and engine detail. It must stay
    // out of the aria-live bar line (announcement storms); milestones live there.
    function statusTicker(model) {
      if (!model.find) return '';
      const seconds = Math.max(0, Math.floor((model.now - model.find.startedAt) / 1000));
      return model.find.detail ? `${model.find.detail} · ${seconds}s` : statusFindTicker(seconds);
    }
    // Priority: error banner > Find busy narration > selected-route summary >
    // transient notice (locked-step explanations) > step context + draft.
    function statusBarText(model) {
      if (model.banner) return model.banner.text;
      if (model.find) return model.find.milestone;
      if (model.route) return model.route;
      if (model.notice) return model.notice;
      return model.draft ? `${model.step} · ${model.draft}` : model.step;
    }
    function statusCancelVisible(model) {
      return !!model.find;
    }
    // role="alert" only on insertion; replacing text on a visible banner stays quiet.
    function statusBannerAnnounce(previous, next) {
      return !previous && next ? 'assertive' : 'none';
    }
    // The cairn never delivers bad news: hidden whenever the banner is visible.
    function cairnVisible(model) {
      return !model.banner && (!!model.find || !!model.celebrate);
    }
    // Sites without a serial pass through; stale serials are ignored.
    function statusSerialActive(current, incoming) {
      return incoming == null || current === incoming;
    }
    // END STATUS STATE
    const statusModel = { banner: null, find: null, route: null, notice: null, step: '', draft: null, celebrate: null };
    let statusTickerTimer = 0, statusSublineVisible = false, cairnCelebrateTimer = 0;
    function statusRender() {
      const model = { ...statusModel, now: Date.now() };
      const bar = $('bar-status'), text = statusBarText(model);
      if (bar.textContent !== text) bar.textContent = text;
      const tickerText = statusTicker(model), ticker = $('status-ticker');
      if (ticker.textContent !== tickerText) ticker.textContent = tickerText;
      $('status-cancel').hidden = !statusCancelVisible(model);
      const showSubline = !!statusModel.find || !!statusModel.celebrate;
      if (showSubline !== statusSublineVisible) {
        statusSublineVisible = showSubline;
        $('status-subline').hidden = !showSubline;
        measureSheet();
      }
      const cairn = $('cairn');
      cairn.hidden = !cairnVisible(statusModel);
      cairn.classList.toggle('cairn-celebrate', !statusModel.find && !!statusModel.celebrate);
    }
    function statusSetStep(text) {
      statusModel.step = text;
      statusModel.notice = null;
      statusRender();
    }
    function statusSetNotice(text) {
      statusModel.notice = text;
      statusRender();
    }
    function statusSetDraft(text) {
      statusModel.draft = text;
      statusRender();
    }
    function statusSetRoute(text) {
      statusModel.route = text;
      statusRender();
    }
    function statusFindStart(serial, milestone) {
      statusModel.celebrate = null;
      clearTimeout(cairnCelebrateTimer);
      statusModel.find = { serial, milestone, detail: '', startedAt: Date.now() };
      clearInterval(statusTickerTimer);
      statusTickerTimer = setInterval(statusRender, 1000);
      statusRender();
    }
    function statusFindMilestone(text, serial) {
      if (!statusModel.find || !statusSerialActive(statusModel.find.serial, serial)) return;
      if (statusModel.find.milestone === text) return;
      statusModel.find.milestone = text;
      statusRender();
    }
    function statusFindDetail(text, serial) {
      if (!statusModel.find || !statusSerialActive(statusModel.find.serial, serial)) return;
      statusModel.find.detail = text;
      statusRender();
    }
    function statusFindEnd(serial) {
      if (!statusModel.find || !statusSerialActive(statusModel.find.serial, serial)) return;
      statusModel.find = null;
      clearInterval(statusTickerTimer);
      statusTickerTimer = 0;
      statusRender();
    }
    // Success cameo: flag-planted cairn for 1.6s, once. Success paths only —
    // failures and cancellations never call this, and the banner still wins.
    function statusCairnCelebrate() {
      statusModel.celebrate = true;
      clearTimeout(cairnCelebrateTimer);
      cairnCelebrateTimer = setTimeout(() => { statusModel.celebrate = null; statusRender(); }, 1600);
      statusRender();
    }
    function statusBannerShow(text, { stage = null } = {}) {
      const banner = $('status-banner');
      const announce = statusBannerAnnounce(statusModel.banner, text);
      statusModel.banner = { text, stage };
      banner.dataset.stage = stage || '';
      $('status-banner-text').textContent = text;
      if (announce === 'assertive') banner.setAttribute('role', 'alert');
      else banner.removeAttribute('role');
      banner.hidden = false;
      statusRender();
      applySnap(false);
    }
    function statusBannerClear() {
      if (!statusModel.banner) return;
      statusModel.banner = null;
      const banner = $('status-banner');
      banner.hidden = true;
      banner.removeAttribute('role');
      statusRender();
      applySnap(false);
    }
    $('status-cancel').addEventListener('click', () => { $('cancel-routing').click(); });
    $('status-banner').addEventListener('click', event => {
      if (event.target.closest('#status-banner-dismiss')) { statusBannerClear(); return; }
      const stage = $('status-banner').dataset.stage;
      if (stage) setStage(stage);
    });
    // END STATUS UI
