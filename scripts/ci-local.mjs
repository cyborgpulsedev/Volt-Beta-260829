#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Volt — run the CI battery here, on a tree built from scratch.

   GitHub Actions bills private repositories, and a Windows runner bills at
   2x. This does the part of CI that actually earns its keep, for nothing:

     * clones the COMMITTED tree to a temp directory — so what is tested is
       what was pushed, not the working copy, and never a file that only
       exists on this machine because someone made it once;
     * installs from package-lock.json with `npm ci --ignore-scripts`, so a
       dependency that is only present because it was installed by hand a
       year ago shows up as the failure it is;
     * runs the same gates the workflow runs, in the workflow's order, and
       stops at the first red one exactly like the workflow does.

   What it CANNOT be is a slow machine. The rented runner has two cores, and
   two real bugs in one day were found only because it is slow. `--slow`
   pins every gate to two cores to get closer; it is not the same as a cold
   two-core VM, but it is far closer than sixteen idle ones.

     node scripts/ci-local.mjs            # clean clone of HEAD, all gates
     node scripts/ci-local.mjs --slow     # the same, pinned to two cores
     node scripts/ci-local.mjs --ref abc1234   # any commit, not just HEAD
     node scripts/ci-local.mjs --keep     # leave the clone for poking at
     node scripts/ci-local.mjs --dirty    # test the WORKING COPY instead
   ═══════════════════════════════════════════════════════════════ */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const slow = has("--slow");
const keep = has("--keep");
const dirty = has("--dirty");
const ref = valueOf("--ref") || "HEAD";

/* The workflow's order, which is not arbitrary: the cheap parse and lint
   gates run first so a typo fails in seconds instead of after the Electron
   ones have burned two minutes. check:vendor takes --no-focus because it
   launches Electron and must not steal the window. */
const GATES = [
  ["check:syntax", []],
  ["check:launchers", []],
  ["test:utils", []],
  ["test:sign", []],
  ["test:pdfbox", []],
  ["test:lock", []],
  ["test:office", []],
  ["test:docx-fidelity", []],
  ["test:watch", []],
  ["check:vendor", ["--", "--no-focus"]],
  ["smoke:browser:headless", []],
  ["test:artifacts", []],
  ["test:release-feed", []],
];

/* Node refuses to spawn a .cmd without a shell (the 2024 argument-injection
   fix), and npm on Windows IS npm.cmd — so every npm call here has to hop
   through cmd.exe. Passed as ONE command string rather than an argv array,
   which is the form that does not warn: with a shell the array is only
   concatenated anyway. Every part is a literal from the table above, never
   user input, so there is nothing here for a shell to chew on. */
const npm = (args, cwd) =>
  spawnSync("npm " + args.join(" "), { cwd, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });

const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8", ...opts }).trim();

/** Run one gate and return whether it passed, printing its output only if it
    did not — a green run should say one line, not five hundred. */
function runGate(cwd, script, extra) {
  const t0 = Date.now();
  let r;
  if (slow) {
    /* Child processes inherit the affinity mask, so pinning the npm process
       pins Electron and every test it spawns. Mask 3 = the first two cores.
       PowerShell is the only way to set this on Windows without a native
       addon, hence the shell hop. */
    const ps = [
      "$ErrorActionPreference='Stop';",
      `$p = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','${script}'${extra.length ? ",'" + extra.join("','") + "'" : ""}) -PassThru -NoNewWindow -WorkingDirectory '${cwd.replace(/'/g, "''")}';`,
      "$p.ProcessorAffinity = 3;",
      "$p.WaitForExit();",
      "exit $p.ExitCode",
    ].join(" ");
    r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } else {
    r = npm(["run", script, ...extra], cwd);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const ok = r.status === 0;
  process.stdout.write(`${ok ? "  ok  " : "  ✗   "}${script.padEnd(24)}${secs}s\n`);
  if (!ok) {
    const out = ((r.stdout || "") + (r.stderr || "")).replace(/\x1b\[[0-9;]*m/g, "");
    // the smoke gates already name their failing terms; show the tail either way
    const stages = out.match(/failing stages: .*/);
    if (stages) process.stdout.write("\n      " + stages[0] + "\n");
    process.stdout.write("\n" + out.split(/\r?\n/).slice(-25).map((l) => "      " + l).join("\n") + "\n\n");
  }
  return ok;
}

function main() {
  let work = null, appDir;
  if (dirty) {
    // escape hatch: iterate on the working copy without paying for a clone.
    // NOT what CI does, and the banner says so, because a pass here proves
    // nothing about what is committed.
    appDir = join(REPO, "pdf-viewer");
    console.log("Volt local CI  [--dirty: the WORKING COPY, not a clean clone]");
  } else {
    const sha = git(["rev-parse", "--short", ref]);
    const subject = git(["log", "-1", "--format=%s", ref]);
    console.log(`Volt local CI  [clean clone of ${sha}${slow ? " · pinned to 2 cores" : ""}]`);
    console.log(`  ${subject}\n`);
    work = mkdtempSync(join(tmpdir(), "volt-ci-"));
    const tree = join(work, "tree");
    // clone from the repo itself rather than the remote: this must test what
    // is COMMITTED here, including work that has not been pushed yet
    git(["clone", "-q", "--no-local", REPO, tree]);
    execFileSync("git", ["checkout", "-q", ref], { cwd: tree });
    appDir = join(tree, "pdf-viewer");

    process.stdout.write("  ..    npm ci (from package-lock)\n");
    const ci = npm(["ci", "--no-audit", "--no-fund", "--ignore-scripts"], appDir);
    if (ci.status !== 0) {
      console.error((ci.stdout || "") + (ci.stderr || "") + (ci.error ? String(ci.error) : ""));
      console.error("\n✗ npm ci failed — the lockfile does not install cleanly.");
      process.exit(1);
    }
    process.stdout.write("  ..    electron binary\n");
    const el = spawnSync("node.exe", ["node_modules/electron/install.js"], { cwd: appDir, encoding: "utf8" });
    if (el.status !== 0 || !existsSync(join(appDir, "node_modules/electron/dist"))) {
      console.error((el.stdout || "") + (el.stderr || ""));
      console.error("\n✗ could not install the Electron binary.");
      process.exit(1);
    }
    console.log("");
  }

  const t0 = Date.now();
  let failed = null;
  for (const [script, extra] of GATES) {
    if (!runGate(appDir, script, extra)) { failed = script; break; } // stop like CI does
  }
  const mins = ((Date.now() - t0) / 60000).toFixed(1);

  if (work && !keep) rmSync(work, { recursive: true, force: true, maxRetries: 5 });
  else if (work) console.log(`\nclone kept at ${work}`);

  if (failed) {
    console.log(`\n✗ ${failed} failed after ${mins} min. Nothing after it ran.`);
    process.exit(1);
  }
  console.log(`\n✓ all ${GATES.length} gates green in ${mins} min` +
    (dirty ? " — on the working copy, which is NOT what a push would carry." : "."));
}

main();
