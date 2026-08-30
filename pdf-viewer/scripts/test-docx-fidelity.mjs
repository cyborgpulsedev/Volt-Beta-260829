// Does an exported Word document still fit on the page it came from?
//
// Every other office test asserts STRUCTURE — the parts are present, the XML
// parses, the ids are numeric. None of them could see the failure that
// mattered most: the export reflowed a dense A4 report onto US Letter at
// Word's default 11pt, and 60 pages came out as 120. The file was perfectly
// valid. It was just twice as long as the document it claimed to be.
//
// This gate renders the .docx and counts the pages. LibreOffice converts it to
// PDF headlessly, and the page count of that PDF is the number a person would
// see. The margin for error is thin enough that only a renderer can settle it:
// the regression that doubled the page count was FOUR TWIPS of overflow per
// page — 0.2pt, invisible to any structural assertion, fatal to every page.
//
// Soft-skips (exit 0 with a note) when LibreOffice is not installed, so a
// machine without it still runs the rest of the suite.
//
// Usage: node scripts/test-docx-fidelity.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", "js", "office-export.js"), "utf8");
const fn = new Function("window", src);
fn(globalThis);
const OE = globalThis.OfficeExport;

let pass = 0, fail = 0, skip = 0;
const t = (name, cond) => {
  if (cond) { pass++; console.log("  \u2713 " + name); }
  else { fail++; console.log("  \u2717 " + name); }
};
const tSkip = (name, why) => { skip++; console.log("  \u2934 " + name + " (skipped \u2014 " + why + ")"); };

/** LibreOffice, wherever this machine keeps it. */
function findSoffice() {
  if (process.env.VOLT_SOFFICE && existsSync(process.env.VOLT_SOFFICE)) return process.env.VOLT_SOFFICE;
  const candidates = process.platform === "win32"
    ? ["C:/Program Files/LibreOffice/program/soffice.exe",
       "C:/Program Files (x86)/LibreOffice/program/soffice.exe"]
    : ["/usr/bin/soffice", "/usr/local/bin/soffice", "/snap/bin/libreoffice",
       "/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  return candidates.find((p) => existsSync(p)) || null;
}

/** Render a .docx and count the pages a reader would actually see. */
function renderedPageCount(soffice, bytes, dir, stem) {
  const docx = join(dir, stem + ".docx");
  writeFileSync(docx, Buffer.from(bytes));
  const r = spawnSync(soffice, ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", dir, docx],
    { encoding: "utf8", timeout: 5 * 60 * 1000 });
  const pdf = join(dir, stem + ".pdf");
  if (!existsSync(pdf)) {
    throw new Error("LibreOffice produced no PDF (" + ((r.stderr || r.stdout || "").trim().slice(0, 200) || "no output") + ")");
  }
  const data = readFileSync(pdf);
  // count page objects; /Type /Page but not /Pages
  const matches = data.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

/** A document whose pages are FULL — the only shape that can catch this.
    A half-empty page absorbs any amount of over-estimation silently. */
function densePages(count, opts) {
  const o = Object.assign({ w: 595, h: 842, size: 8, lead: 12, lines: 62, top: 780, left: 46 }, opts);
  return {
    title: "Fidelity.pdf",
    pages: Array.from({ length: count }, (_, p) => ({
      num: p + 1,
      size: { w: o.w, h: o.h },
      tables: [], images: [],
      paragraphs: Array.from({ length: o.lines }, (_, i) => ({
        text: "Line " + (i + 1) + " of page " + (p + 1) + " \u2014 reading " + (p * 100 + i) +
          " recorded at station " + ((i % 7) + 1) + "; deviation within tolerance.",
        size: o.size, lead: o.lead, x: o.left, y: o.top - i * o.lead,
      })),
    })),
  };
}

const soffice = findSoffice();
console.log("docx fidelity \u2014 does an exported page still fit on one page?\n");
if (!soffice) {
  tSkip("dense A4 export keeps its page count", "LibreOffice not installed");
  tSkip("US Letter export keeps its page count", "LibreOffice not installed");
  tSkip("landscape export keeps its page count", "LibreOffice not installed");
  console.log("\n  Install LibreOffice, or set VOLT_SOFFICE, to run this gate.");
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  process.exit(0);
}
console.log("  using " + soffice + "\n");

const dir = mkdtempSync(join(tmpdir(), "volt-fidelity-"));
try {
  const cases = [
    { name: "dense A4 export keeps its page count", pages: 12, opts: {} },
    { name: "US Letter export keeps its page count", pages: 8,
      opts: { w: 612, h: 792, size: 10, lead: 14, lines: 48, top: 720 } },
    { name: "landscape export keeps its page count", pages: 6,
      opts: { w: 842, h: 595, size: 9, lead: 13, lines: 38, top: 545 } },
  ];
  for (const c of cases) {
    const doc = densePages(c.pages, c.opts);
    let got = null, err = null;
    try { got = renderedPageCount(soffice, OE.docx(doc), dir, c.name.split(" ")[0] + c.pages); }
    catch (e) { err = e.message; }
    if (err) { t(c.name + " \u2014 " + err, false); continue; }
    // one page of slack for a trailing empty page, which some renderers add;
    // anything beyond that is content spilling, which is the bug
    const ok = got >= c.pages && got <= c.pages + 1;
    t(c.name + " (" + c.pages + " in \u2192 " + got + " out)", ok);
  }
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
