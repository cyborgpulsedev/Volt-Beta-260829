#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Volt — reconcile a GitHub release after electron-builder publishes.

   electron-builder uploads a release's assets concurrently and each
   uploader independently decides whether the release needs creating.
   They race: one wins, the others get 422 "Published releases must
   have a valid tag", and the run exits non-zero having uploaded only
   SOME of the files. Twice now that left a published release carrying
   the installer but no latest.yml — a download page that works and an
   update feed that 404s, which is the worst of the two failure modes
   because nothing looks wrong from the outside.

   This script makes the end state right whatever the race did:
     * builds latest.yml from the artifact actually on disk (version,
       size, sha512, release notes) if it is missing,
     * uploads whatever assets the release is short of,
     * sets the release title and body from release-notes.md,
     * verifies the feed lists the same size + sha512 as the installer.

   Run automatically by scripts/release.cjs. Standalone:
     GH_TOKEN=$(gh auth token) node scripts/finish-release.cjs
   ═══════════════════════════════════════════════════════════════ */
"use strict";
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync, existsSync, statSync, renameSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;
const REPO = (() => {
  const p = (pkg.build && pkg.build.publish) || [];
  const gh = (Array.isArray(p) ? p : [p]).find((x) => x && x.provider === "github");
  if (!gh) throw new Error("no github publish target in package.json");
  return gh.owner + "/" + gh.repo;
})();
const TAG = "v" + VERSION;
const EXE = "Volt-Setup-" + VERSION + ".exe";

// the GitHub CLI ships as gh.exe, not gh.cmd — spawning "gh.cmd" under a shell
// fails with "not recognized", which read as "no such release" and hid the
// real problem
function gh(args, opts = {}) {
  // no shell: the release title contains a space, and cmd.exe re-splits it
  // into two arguments ("accepts 1 arg(s), received 2"). gh ships as gh.exe,
  // which Node resolves through PATHEXT without a shell.
  const r = spawnSync("gh", args, { encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function sha512b64(path) {
  return createHash("sha512").update(readFileSync(path)).digest("base64");
}

function buildLatestYml(exePath) {
  const notes = readFileSync(join(ROOT, "release-notes.md"), "utf8").replace(/\n+$/, "");
  const indented = notes.split("\n").map((l) => (l.trim() ? "  " + l : "")).join("\n");
  const size = statSync(exePath).size;
  const sha = sha512b64(exePath);
  const stamp = new Date().toISOString().replace(/(\.\d{3})\d*Z$/, "$1Z");
  return "version: " + VERSION + "\nfiles:\n  - url: " + EXE + "\n    sha512: " + sha +
    "\n    size: " + size + "\npath: " + EXE + "\nsha512: " + sha +
    "\nreleaseNotes: |\n" + indented + "\nreleaseDate: '" + stamp + "'\n";
}

function main() {
  const exePath = join(DIST, EXE);
  if (!existsSync(exePath)) {
    console.error("✖ " + EXE + " is not in dist/ — nothing to reconcile.");
    process.exit(1);
  }
  const view = gh(["release", "view", TAG, "-R", REPO, "--json", "assets,name", "--jq", "."]);
  if (view.code !== 0) {
    console.error("✖ no published release " + TAG + " on " + REPO + " — publish first.");
    console.error("  " + view.err);
    process.exit(1);
  }
  const have = new Set((JSON.parse(view.out).assets || []).map((a) => a.name));
  console.log("· " + TAG + " on " + REPO + " currently has: " + ([...have].join(", ") || "nothing"));

  // latest.yml must describe the artifact that is actually published
  const ymlPath = join(DIST, "latest.yml");
  const stale = !existsSync(ymlPath) || !readFileSync(ymlPath, "utf8").startsWith("version: " + VERSION);
  if (stale) {
    const tmp = ymlPath + ".tmp";
    writeFileSync(tmp, buildLatestYml(exePath));
    if (statSync(tmp).size < 200) throw new Error("generated latest.yml is implausibly small");
    renameSync(tmp, ymlPath);
    console.log("· rebuilt latest.yml for " + VERSION);
  }

  const wanted = [EXE, EXE + ".blockmap", "latest.yml"];
  const missing = wanted.filter((n) => !have.has(n) && existsSync(join(DIST, n)));
  // latest.yml is re-uploaded even when present, so a stale feed cannot survive
  const upload = [...new Set([...missing, "latest.yml"])].filter((n) => existsSync(join(DIST, n)));
  if (upload.length) {
    const r = gh(["release", "upload", TAG, "-R", REPO, ...upload.map((n) => join(DIST, n)), "--clobber"]);
    if (r.code !== 0) { console.error("✖ upload failed: " + r.err); process.exit(1); }
    console.log("· uploaded: " + upload.join(", "));
  }

  const e = gh(["release", "edit", TAG, "-R", REPO, "--title", "Volt " + VERSION,
    "--notes-file", join(ROOT, "release-notes.md")]);
  if (e.code !== 0) { console.error("✖ could not set the release notes: " + e.err); process.exit(1); }

  // verify: the feed must describe the installer that is actually attached
  const after = gh(["release", "view", TAG, "-R", REPO, "--json", "assets", "--jq", "."]);
  const assets = JSON.parse(after.out).assets || [];
  const exeAsset = assets.find((a) => a.name === EXE);
  const yml = readFileSync(ymlPath, "utf8");
  const ymlSize = Number((/^\s+size:\s*(\d+)/m.exec(yml) || [])[1]);
  const ymlSha = (/^sha512:\s*(\S+)/m.exec(yml) || [])[1];
  const ok = !!exeAsset && exeAsset.size === ymlSize && ymlSha === sha512b64(exePath) &&
    assets.some((a) => a.name === "latest.yml");
  console.log(ok
    ? "✓ " + TAG + " is complete — installer, blockmap and a feed that matches it."
    : "✖ " + TAG + " is INCONSISTENT: installer " + (exeAsset && exeAsset.size) + " bytes vs feed " + ymlSize);
  process.exit(ok ? 0 : 1);
}

main();
