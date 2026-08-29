// Drives a REAL Electron window against the running Volt dev server and
// exercises the add_form_field AI tool the way the shipped app would:
// pages actually render (compositing on), so the span/coordinate math the
// tool depends on is genuinely under test.
//   npx electron <this file>
const { app, BrowserWindow } = require("electron");

const URL = process.env.VOLT_URL || "http://localhost:8421/index.html";

function done(result, code) {
  console.log("FIELD_TEST " + JSON.stringify(result, null, 1));
  setTimeout(() => app.exit(code), 200);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 900,
    show: true,               // must be shown — hidden windows don't composite,
    backgroundColor: "#0A0B10", // which is exactly why the headless probe failed
  });

  setTimeout(() => done({ ok: false, error: "watchdog timeout" }, 2), 90000).unref();

  win.webContents.on("console-message", (e) => {
    if (e.level >= 2) console.log("[renderer] " + e.message);
  });

  await win.loadURL(URL);

  const result = await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const out = { stages: [] };
    const App = window.Volt && window.Volt.App;
    const AI  = window.Volt && window.Volt.AI;
    const Ann = window.Volt && window.Volt.Ann;
    if (!App || !AI || !Ann) return { ok: false, error: "app globals missing" };

    // dismiss first-run setup so it can't swallow clicks
    try { App._markSetupDone(true); const m = document.getElementById('setup-modal'); if (m && !m.hidden) App._closeModal(m); } catch (e) {}

    // open the bundled sample
    const btn = document.getElementById('empty-sample') ||
                [...document.querySelectorAll('button')].find(b => /sample/i.test(b.textContent));
    if (!btn) return { ok: false, error: "sample button not found" };
    btn.click();

    // wait for a page to actually RENDER (this is what the headless run never got)
    let waited = 0;
    while (waited < 20000 && App.rendered.size === 0) { await sleep(200); waited += 200; }
    out.stages.push({ stage: "render", renderedPages: [...App.rendered.keys()], pages: App.currentDoc ? App.currentDoc.numPages : 0 });
    if (!App.rendered.size) return { ok: false, error: "no page rendered", ...out };

    // a phrase that really exists on page 1, to test near_text anchoring
    const wrap = App.rendered.get(1) && App.rendered.get(1).wrap;
    const spans = wrap ? [...wrap.querySelectorAll('.page-text-layer span')].filter(s => s.textContent.trim()) : [];
    const anchorPhrase = spans.length ? spans[Math.min(3, spans.length - 1)].textContent.trim().split(/\\s+/)[0] : "";
    out.stages.push({ stage: "textLayer", spanCount: spans.length, anchorPhrase });

    const pageRect = wrap.getBoundingClientRect();

    // ── 1. anchored signature field ──────────────────────────
    const r1 = JSON.parse(await AI._runTool('add_form_field', {
      page: 1, field_type: 'signature', name: 'sig_anchored', near_text: anchorPhrase
    }));
    const a1 = Ann.list.filter(a => a.type === 'form').slice(-1)[0] || null;
    out.stages.push({ stage: "anchoredSignature", result: r1, ann: a1 && {
      page: a1.page, fieldType: a1.fieldType, name: a1.name,
      rect: a1.rect,
    }});

    // ── 2. centered signature field (no near_text) ───────────
    const r2 = JSON.parse(await AI._runTool('add_form_field', {
      page: 1, field_type: 'signature', name: 'sig_centered'
    }));
    const a2 = Ann.list.filter(a => a.type === 'form').slice(-1)[0] || null;
    out.stages.push({ stage: "centeredSignature", result: r2, ann: a2 && {
      rect: a2.rect,
    }});

    // ── 3. does it actually paint on the page? ───────────────
    // Form fields are drawn onto the page's <canvas class="page-overlay">,
    // not as DOM nodes — so verify by sampling PIXELS inside the field rect.
    await sleep(800);
    const overlay = wrap.querySelector('canvas.page-overlay');
    let paint = { overlay: !!overlay };
    if (overlay && a1) {
      const octx = overlay.getContext('2d', { willReadFrequently: true });
      const rl = Ann._rectLocal(wrap, a1.rect ? a1 : a1);
      const sx = overlay.width / overlay.getBoundingClientRect().width;   // DPR scale
      const sy = overlay.height / overlay.getBoundingClientRect().height;
      const px = Math.round((rl.x + rl.w / 2) * sx);
      const py = Math.round((rl.y + rl.h / 2) * sy);
      const d = octx.getImageData(Math.max(0, px - 12), Math.max(0, py - 12), 24, 24).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
      // sample a far corner as a negative control (should be blank)
      const dc = octx.getImageData(2, 2, 12, 12).data;
      let ctrl = 0;
      for (let i = 3; i < dc.length; i += 4) if (dc[i] > 0) ctrl++;
      paint = { overlay: true, rectLocal: rl, samplePx: { x: px, y: py },
                litPixelsInField: lit, litPixelsInBlankCorner: ctrl,
                insidePage: rl.x >= -1 && rl.y >= -1 &&
                            rl.x + rl.w <= wrap.getBoundingClientRect().width + 1 &&
                            rl.y + rl.h <= wrap.getBoundingClientRect().height + 1 };
    }
    out.stages.push({ stage: "painted", paint });

    // ── 4. other field types ─────────────────────────────────
    const kinds = {};
    for (const k of ['text', 'checkbox', 'date']) {
      kinds[k] = JSON.parse(await AI._runTool('add_form_field', { page: 1, field_type: k, name: 'f_' + k }));
    }
    out.stages.push({ stage: "otherTypes", kinds });

    // ── 5. does it EXPORT as a real AcroForm widget? ─────────
    let exported = null;
    try {
      const bytes = await Ann.toAnnotatedPdf();
      const txt = new TextDecoder('latin1').decode(bytes.slice(0, bytes.length));
      exported = {
        bytes: bytes.length,
        hasAcroForm: txt.includes('/AcroForm'),
        hasWidget: txt.includes('/Widget'),
        hasSigName: txt.includes('sig_anchored') || txt.includes('sig_centered'),
      };
    } catch (e) { exported = { error: String(e && e.message || e) }; }
    out.stages.push({ stage: "export", exported });

    // ── 6. bad input handling ────────────────────────────────
    const bad = JSON.parse(await AI._runTool('add_form_field', { page: 999, field_type: 'signature' }));
    out.stages.push({ stage: "badPage", result: bad });

    const formCount = Ann.list.filter(a => a.type === 'form').length;
    const finite = (r) => r && ['x','y','w','h'].every(k => Number.isFinite(r[k])) && r.w > 0 && r.h > 0;
    out.rectsValid = finite(a1 && a1.rect) && finite(a2 && a2.rect);
    out.anchorMovedIt = !!(a1 && a2 && (Math.abs(a1.rect.x - a2.rect.x) > 1 || Math.abs(a1.rect.y - a2.rect.y) > 1));
    out.painted = !!(paint.litPixelsInField > 0 && paint.insidePage);
    out.ok = !!(r1.ok && r2.ok && out.rectsValid && out.painted && exported && exported.hasWidget);
    out.formCount = formCount;
    return out;
  })()`);

  done(result, result && result.ok ? 0 : 1);
}).catch((e) => done({ ok: false, error: String((e && e.stack) || e) }, 2));
