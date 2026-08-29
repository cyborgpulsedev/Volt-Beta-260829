// ═══════════════════════════════════════════════════════════════
//   Volt — icon generator
//   Resizes the official brand mark (assets/volt-icon-transparent-1.png,
//   kept in the repo root's assets/ folder) into every icon the app and
//   its installer need:
//     assets/icon-512.png        (PWA 512 + maskable)
//     assets/icon-192.png        (PWA 192 + apple-touch-icon + toolbar mark)
//     assets/favicon-32.png      (browser favicon)
//     assets/volt.ico            (multi-size Windows icon, PNG entries)
//     build/installerIcon.ico    (NSIS install wizard)
//     build/uninstallerIcon.ico  (NSIS uninstall wizard)
//     build/installerSidebar.bmp   (164×314 welcome/finish panel)
//     build/uninstallerSidebar.bmp (164×314, same art)
//     build/installerHeader.bmp    (150×57 top-right header strip)
//
//   The mark used to be hand-drawn as an inline SVG here, which meant this
//   script would silently overwrite the official artwork with an
//   approximation. It now resizes the real PNG instead — single source of
//   truth, no drift.
//
//   Run:  npx electron scripts/gen-icons.cjs
// ═══════════════════════════════════════════════════════════════

const { app, nativeImage } = require("electron");
const { writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");

const APP_DIR = join(__dirname, "..");
const OUT = join(APP_DIR, "assets");
const BUILD = join(APP_DIR, "build");

// the official mark lives one level up, alongside the other brand exports
const SOURCE = join(APP_DIR, "..", "assets", "volt-icon-transparent-1.png");

// NSIS renders its wizard bitmaps on a light-grey chrome; the mark is a
// transparent neon outline, so it needs a dark plate behind it to read.
const BG = { r: 0x0a, g: 0x0b, b: 0x10 };

function pngsOf(img, sizes) {
  const out = [];
  for (const s of sizes) {
    out.push({ size: s, png: img.resize({ width: s, height: s, quality: "best" }).toPNG() });
  }
  return out;
}

function packIco(pngs) {
  const entries = pngs.map((p) => {
    const b = p.size >= 256 ? 0 : p.size; // 0 encodes 256
    return {
      w: b, h: b, size: p.png.length, buf: p.png,
    };
  });
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirSize = count * 16;
  let offset = 6 + dirSize;
  const dir = Buffer.alloc(dirSize);
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.w, o + 0);
    dir.writeUInt8(e.h, o + 1);
    dir.writeUInt8(0, o + 2); // palette
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // color planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(e.size, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.size;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

/* Compose the mark, centred and letterboxed, onto an opaque BG plate of the
   given size and encode it as a 24-bit BMP. NSIS will not read PNG or a
   32-bit alpha BMP for its wizard bitmaps — it wants plain BGR, bottom-up. */
function bmpOf(img, W, H, markScale = 0.72) {
  const box = Math.round(Math.min(W, H) * markScale);
  const mark = img.resize({ width: box, height: box, quality: "best" });
  const m = mark.getSize();
  const src = mark.toBitmap(); // BGRA, top-down, premultiplied-free
  const offX = Math.round((W - m.width) / 2);
  const offY = Math.round((H - m.height) / 2);

  const rowBytes = W * 3;
  const pad = (4 - (rowBytes % 4)) % 4;
  const stride = rowBytes + pad;
  const pixels = Buffer.alloc(stride * H);

  for (let y = 0; y < H; y++) {
    // BMP scanlines run bottom-up
    const rowStart = (H - 1 - y) * stride;
    for (let x = 0; x < W; x++) {
      let b = BG.b, g = BG.g, r = BG.r;
      const mx = x - offX, my = y - offY;
      if (mx >= 0 && my >= 0 && mx < m.width && my < m.height) {
        const si = (my * m.width + mx) * 4;
        const a = src[si + 3] / 255;
        if (a > 0) {
          b = Math.round(src[si + 0] * a + BG.b * (1 - a));
          g = Math.round(src[si + 1] * a + BG.g * (1 - a));
          r = Math.round(src[si + 2] * a + BG.r * (1 - a));
        }
      }
      const di = rowStart + x * 3;
      pixels[di + 0] = b;
      pixels[di + 1] = g;
      pixels[di + 2] = r;
    }
  }

  const fileHeader = Buffer.alloc(14);
  const infoHeader = Buffer.alloc(40);
  const dataOffset = 14 + 40;
  fileHeader.write("BM", 0);
  fileHeader.writeUInt32LE(dataOffset + pixels.length, 2);
  fileHeader.writeUInt32LE(dataOffset, 10);
  infoHeader.writeUInt32LE(40, 0);
  infoHeader.writeInt32LE(W, 4);
  infoHeader.writeInt32LE(H, 8);
  infoHeader.writeUInt16LE(1, 12); // planes
  infoHeader.writeUInt16LE(24, 14); // bpp
  infoHeader.writeUInt32LE(0, 16); // BI_RGB
  infoHeader.writeUInt32LE(pixels.length, 20);

  return Buffer.concat([fileHeader, infoHeader, pixels]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const img = nativeImage.createFromPath(SOURCE);
  if (img.isEmpty()) throw new Error("could not read source mark: " + SOURCE);
  const s = img.getSize();
  console.log("source:", SOURCE, `${s.width}×${s.height}`);

  const icon512 = img.resize({ width: 512, height: 512, quality: "best" }).toPNG();
  const icon192 = img.resize({ width: 192, height: 192, quality: "best" }).toPNG();
  const favicon = img.resize({ width: 32, height: 32, quality: "best" }).toPNG();

  writeFileSync(join(OUT, "icon-512.png"), icon512);
  writeFileSync(join(OUT, "icon-192.png"), icon192);
  writeFileSync(join(OUT, "favicon-32.png"), favicon);

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const ico = packIco(pngsOf(img, icoSizes));
  writeFileSync(join(OUT, "volt.ico"), ico);

  console.log("wrote icon-512.png (%d b), icon-192.png (%d b), favicon-32.png (%d b), volt.ico (%d b, %d entries)",
    icon512.length, icon192.length, favicon.length, ico.length, icoSizes.length);

  // ── installer wizard branding ──────────────────────────────
  mkdirSync(BUILD, { recursive: true });
  writeFileSync(join(BUILD, "installerIcon.ico"), ico);
  writeFileSync(join(BUILD, "uninstallerIcon.ico"), ico);

  // NSIS fixes these dimensions; anything else is stretched or rejected
  const sidebar = bmpOf(img, 164, 314, 0.62);
  const header = bmpOf(img, 150, 57, 0.78);
  writeFileSync(join(BUILD, "installerSidebar.bmp"), sidebar);
  writeFileSync(join(BUILD, "uninstallerSidebar.bmp"), sidebar);
  writeFileSync(join(BUILD, "installerHeader.bmp"), header);

  console.log("wrote build/: installerIcon.ico, uninstallerIcon.ico, installerSidebar.bmp (%d b), uninstallerSidebar.bmp, installerHeader.bmp (%d b)",
    sidebar.length, header.length);

  app.quit();
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
