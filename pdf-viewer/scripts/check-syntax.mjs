#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Parse every first-party source file, and nothing else.

   Why this is worth its own gate: main.js carries the smoke probes as
   template literals that get injected into the renderer, so a backtick typed
   inside one of those probes — in a COMMENT is the easy way to do it — closes
   the literal early and turns the whole file into a syntax error. Electron
   then dies at startup behind a modal "A JavaScript error occurred in the
   main process" dialog, one per launch, and a five-run test loop leaves five
   of them stacked on the desktop. The smoke does catch it, ninety seconds
   later, as a confusing crash rather than a parse error.

   Parsing costs milliseconds and names the file and line, so it runs first.
   `node --check` only parses; it never executes, so this is safe on any file.
   ═══════════════════════════════════════════════════════════════ */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
// vendored libraries are third-party and some ship non-standard bundles;
// node_modules is not ours to police
const SKIP = new Set(["node_modules", "vendor", "dist", "release", ".git"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(APP);
const bad = [];
for (const f of files) {
  try {
    // .mjs parses as a module, everything else as a script — node picks by
    // extension, so no flag juggling is needed
    execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    bad.push({ file: relative(APP, f), err: String(e.stderr || e.message).trim().split("\n").slice(0, 4).join("\n") });
  }
}

for (const b of bad) console.error("✗ " + b.file + "\n  " + b.err.replace(/\n/g, "\n  "));
console.log((bad.length ? "✗ " : "✓ ") + files.length + " files parsed, " + bad.length + " failed");
process.exit(bad.length ? 1 : 0);
