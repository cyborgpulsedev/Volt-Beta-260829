#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Volt — publish a snapshot of `main` to the PUBLIC beta repo
   (github.com/cyborgpulsedev/Volt-Beta-260829).

   The beta repo is a snapshot mirror, not a shared-history fork: each
   release lands as one commit on top of its own history, so its release
   tags stay anchored. This script does that, and — the reason it exists —
   applies BETA_EXCLUDE every single time.

   The exclusion is CODE, not a note in a README, precisely because a
   whole-tree snapshot silently re-adds anything a human forgets to strip.
   Files listed below live in the private repo and must never reach the
   public one.

     node scripts/sync-beta.cjs "commit subject"    # publish
     node scripts/sync-beta.cjs --dry-run           # show what would change
   ═══════════════════════════════════════════════════════════════ */

const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, existsSync, copyFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

/* Never published to the public beta repo.
   Brand masters and unused exports: ~10 MB of editable source art that the
   app never reads. Only assets/volt-icon-transparent-1.png is referenced
   (scripts/gen-icons.cjs renders every app icon from it), so that one stays.
   Add a path here and it is excluded from every future sync automatically. */
const BETA_EXCLUDE = [
  /* Build recipe, not distribution. Published to the beta repo these would
     run a full Windows CI job on every sync, fail noisily on release tags
     because CSC_LINK / CSC_KEY_PASSWORD / GH_TOKEN do not exist there, and
     advertise the signing pipeline's secret names to anyone reading. The
     beta repo is a download channel; building happens in the private one. */
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  ".github/workflows/linux.yml",
  ".github/workflows/macos.yml",

  /* Internal planning, not documentation. before-launch.md is written FOR
     the owner: it records the unsigned-publishing state, which decisions are
     deliberately parked, and whether Volt is ever sold. None of it is
     dangerous, and none of it is a tester's business either - a public repo
     is not the place for a private to-do list about the product's commercial
     posture. Excluded deliberately rather than by remembering each time,
     because a whole-tree snapshot re-adds whatever a human forgets to strip. */
  "docs/before-launch.md",

  "assets/Volt Design Set.png",
  "assets/volt-icon-black.png",
  "assets/volt-icon-glow-1.png",
  "assets/volt-icon-glow-1.psd",
  "assets/volt-icon-glow.png",
  "assets/volt-icon-transparent.png",
  "assets/volt-icon-transparent.psd",
  "assets/volt-icon.png",
  "assets/volt-logo.png",
];

/* Published under a DIFFERENT name in the beta repo.
   The private repo's README is written for someone with the source; a beta
   tester needs the download, the SmartScreen note, what to try and where to
   report — and, critically, a link to THIS repo's releases rather than the
   private one that 404s for them. Authoring it in main keeps both READMEs
   under review together; the source file is dropped from the published tree
   so the beta repo shows exactly one README. */
const BETA_SUBSTITUTE = { "README.md": "docs/README.beta.md" };

const BETA_REMOTE = "beta";
const BETA_URL = "https://github.com/cyborgpulsedev/Volt-Beta-260829.git";
const REPO = join(__dirname, "..");

const dryRun = process.argv.includes("--dry-run");
const subject = process.argv.slice(2).find((a) => !a.startsWith("--"));

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", ...opts }).trim();
}

function main() {
  // never publish uncommitted or half-staged work
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty) {
    console.error("Working tree has uncommitted changes — commit or stash first:\n" + dirty);
    process.exit(1);
  }

  // make sure the remote exists (first run on a fresh clone)
  const remotes = git(["remote"]).split(/\r?\n/);
  if (!remotes.includes(BETA_REMOTE)) git(["remote", "add", BETA_REMOTE, BETA_URL]);
  git(["fetch", "-q", BETA_REMOTE, "main"]);

  const work = mkdtempSync(join(tmpdir(), "volt-beta-"));
  const wt = join(work, "tree");
  let added = false;
  try {
    git(["worktree", "add", "-q", wt, `${BETA_REMOTE}/main`]);
    added = true;
    const inWt = { cwd: wt };

    git(["checkout", "-q", "-B", "beta-sync"], inWt);

    // Clear the checkout, then lay down main's tree. Clearing first is what
    // makes DELETIONS propagate — writing files alone would let anything
    // removed in main linger in beta forever.
    for (const f of git(["ls-files"], inWt).split(/\r?\n/).filter(Boolean)) {
      rmSync(join(wt, f), { force: true });
    }
    // plumbing rather than `tar` (the bundled MSYS tar can't take a Windows
    // path for -C) and rather than `checkout main -- .`: read-tree swaps the
    // index to main's tree, checkout-index materialises it in the worktree.
    git(["read-tree", "main"], inWt);
    git(["checkout-index", "-a", "-f"], inWt);

    // the whole point: strip the private-only artwork every time
    const stripped = [];
    for (const rel of BETA_EXCLUDE) {
      const p = join(wt, rel);
      if (existsSync(p)) { rmSync(p, { force: true }); stripped.push(rel); }
    }

    // swap in the beta-facing versions, then remove their sources
    const swapped = [];
    for (const [dest, src] of Object.entries(BETA_SUBSTITUTE)) {
      const from = join(wt, src);
      if (!existsSync(from)) continue;
      copyFileSync(from, join(wt, dest));
      rmSync(from, { force: true });
      swapped.push(dest + " ← " + src);
    }

    git(["add", "-A"], inWt);

    const staged = git(["diff", "--cached", "--stat"], inWt);
    if (!staged) {
      console.log("Beta is already up to date — nothing to publish.");
      return;
    }

    console.log("Excluded from beta (" + stripped.length + "):");
    for (const s of stripped) console.log("  - " + s);
    if (swapped.length) {
      console.log("Beta-specific files (" + swapped.length + "):");
      for (const s of swapped) console.log("  ~ " + s);
    }
    console.log("\nChanges to publish:\n" + staged);

    // Guard: the published tree must differ from main by EXACTLY the
    // exclusions. Anything else means the snapshot went wrong.
    const betaTree = git(["write-tree"], inWt);
    const drift = git(["diff", "--name-only", "main", betaTree])
      .split(/\r?\n/).filter(Boolean)
      .filter((f) => !BETA_EXCLUDE.includes(f)
        && !Object.keys(BETA_SUBSTITUTE).includes(f)
        && !Object.values(BETA_SUBSTITUTE).includes(f));
    if (drift.length) {
      console.error("\nAborting — snapshot differs from main beyond the exclusion list:\n  " + drift.join("\n  "));
      process.exit(1);
    }

    if (dryRun) { console.log("\n--dry-run: nothing pushed."); return; }

    const msg = (subject || "Publish snapshot of main")
      + "\n\nSnapshot of the private main repo."
      + "\nPrivate-only artwork excluded by scripts/sync-beta.cjs.\n";
    git(["commit", "-q", "-m", msg], inWt);
    git(["push", BETA_REMOTE, "beta-sync:main"], inWt);
    console.log("\nPublished " + git(["rev-parse", "--short", "HEAD"], inWt) + " to " + BETA_REMOTE + "/main");
  } finally {
    if (added) { try { git(["worktree", "remove", wt, "--force"]); } catch (e) { /* best effort */ } }
    try { git(["worktree", "prune"]); } catch (e) { /* best effort */ }
    rmSync(work, { recursive: true, force: true });
  }
}

main();
