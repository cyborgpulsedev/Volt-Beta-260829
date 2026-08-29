// Reproduces the duplicate/stale-size page bug: hammer zoom (and view-mode)
// changes so teardowns land in the middle of an in-flight page render, then
// assert the DOM never holds two wraps for the same page, and that every
// wrap's size matches the CURRENT zoom.
const { app, BrowserWindow } = require("electron");
const URL = process.env.VOLT_URL || "http://localhost:8421/index.html";

function done(r, code) {
  console.log("ZOOM_RACE " + JSON.stringify(r, null, 1));
  setTimeout(() => app.exit(code), 200);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: true, backgroundColor: "#0A0B10" });
  setTimeout(() => done({ ok: false, error: "watchdog" }, 2), 120000).unref();
  await win.loadURL(URL);

  const result = await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const App = window.Volt.App;
    try { App._markSetupDone(true); const m = document.getElementById('setup-modal'); if (m && !m.hidden) App._closeModal(m); } catch (e) {}
    const btn = document.getElementById('empty-sample') ||
                [...document.querySelectorAll('button')].find(b => /sample/i.test(b.textContent));
    if (btn) btn.click();
    let waited = 0;
    while (waited < 20000 && App.rendered.size === 0) { await sleep(200); waited += 200; }
    if (!App.rendered.size) return { ok: false, error: "sample never rendered" };

    const pagesEl = App.elements.pages;
    const snapshot = (label) => {
      const wraps = [...pagesEl.querySelectorAll('.page-wrap')];
      const byPage = {};
      for (const w of wraps) {
        const n = Number(w.dataset.page);
        (byPage[n] = byPage[n] || []).push(Math.round(w.getBoundingClientRect().width));
      }
      const dupes = Object.entries(byPage).filter(([, ws]) => ws.length > 1)
                          .map(([n, ws]) => ({ page: Number(n), widths: ws }));
      // expected width for the current zoom, per page
      const wrongSize = [];
      for (const w of wraps) {
        const n = Number(w.dataset.page);
        const dim = App.pageDims[n - 1];
        if (!dim) continue;
        const expect = dim.w * App.zoom;
        const actual = w.getBoundingClientRect().width;
        if (Math.abs(actual - expect) > 2) wrongSize.push({ page: n, actual: Math.round(actual), expect: Math.round(expect) });
      }
      // orphans: a wrap in the DOM that App.rendered doesn't own
      const orphans = wraps.filter(w => {
        const owner = App.rendered.get(Number(w.dataset.page));
        return !owner || owner.wrap !== w;
      }).map(w => Number(w.dataset.page));
      return { label, zoom: +App.zoom.toFixed(3), wraps: wraps.length, dupes, wrongSize, orphans };
    };

    const problems = [];
    const record = (s) => { if (s.dupes.length || s.wrongSize.length || s.orphans.length) problems.push(s); };

    // ── burst 1: rapid zoom in/out with NO settle time (worst case) ──
    const zooms = [1.5, 0.5, 2.2, 0.76, 3.0, 0.3, 1.0];
    for (const z of zooms) { App.setZoom(z); await sleep(12); }
    await sleep(2500);
    record(snapshot("after rapid zoom burst"));

    // ── burst 2: zoom changes interleaved with scrolling ──
    for (let i = 0; i < 8; i++) {
      App.setZoom(i % 2 ? 0.6 : 1.8);
      App.elements.scroller.scrollTop += 400;
      await sleep(25);
    }
    await sleep(2500);
    record(snapshot("after zoom+scroll burst"));

    // ── burst 3: view-mode flips mid-render ──
    for (const m of ['spread', 'one', 'continuous', 'spread', 'continuous']) {
      App.setViewMode(m); await sleep(30);
    }
    await sleep(2500);
    record(snapshot("after view-mode burst"));

    // ── settle: a normal single zoom, fully awaited ──
    App.setZoom(1.0);
    await sleep(2500);
    const final = snapshot("settled");
    record(final);

    return {
      ok: problems.length === 0,
      problems,
      final,
      renderGen: App.renderGen,
      pendingRender: App.pendingRender.size,
    };
  })()`);

  done(result, result && result.ok ? 0 : 1);
}).catch((e) => done({ ok: false, error: String(e && e.stack || e) }, 2));
