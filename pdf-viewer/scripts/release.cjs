#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Volt — signed release wrapper (npm run release)

   Releasing unsigned is exactly how SmartScreen warnings start — and
   once a cert is configured, `verifyUpdateCodeSignature` makes the
   auto-updater REJECT any update not signed by the same publisher, so
   a release must always be signed. This wrapper therefore:
     1. requires a code-signing certificate (CSC_LINK / WIN_CSC_LINK
        + CSC_KEY_PASSWORD / WIN_CSC_KEY_PASSWORD),
     2. refuses SELF-SIGNED / expired / keyless certs (signing-setup
        check-release) — publishing with a dev cert would SmartScreen
        every user AND break their auto-updates (untrusted chain),
     3. builds + publishes with electron-builder (`--win nsis
        --publish always` — extra CLI args pass through, e.g.
        `-c.publish.provider=generic -c.publish.url=https://…`),
     4. runs scripts/check-signing.cjs and exits non-zero unless the
        artifacts verify as signed by the configured publisher.

   CSC_LINK may be a path to a .pfx OR a base64-encoded .pfx (handy
   for CI secrets). Without a cert, `npm run dist` still works for
   dev/private builds.

   SCRATCH UNSIGNED RELEASES (feed-mechanics testing only): set
   VOLT_ALLOW_UNSIGNED=1 to skip the certificate requirement, the
   self-signed guard, and the sign:check gate, publishing an UNSIGNED
   build. This is the deliberate escape hatch behind the release
   workflow's scratch_unsigned input — the ONLY legitimate use is
   proving the publish/feed pipeline works before a real cert lands
   (e.g. that the auto-update feed URL serves a real latest.yml). An
   unsigned release means SmartScreen warnings for every user and NO
   updater signature verification — delete the scratch release after
   verifying.

   Usage:  npm run release [electron-builder args…]
   ═══════════════════════════════════════════════════════════════ */
"use strict";
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { existsSync, readFileSync } = require("node:fs");
require("./load-env.cjs")(); // CSC_LINK/CSC_KEY_PASSWORD from .env (env vars win)

// SCRATCH UNSIGNED releases: VOLT_ALLOW_UNSIGNED=1 skips the certificate
// requirement, the cert guard, and the sign:check gate — the deliberate
// escape hatch behind the release workflow's scratch_unsigned input. The
// ONLY legitimate use is proving the publish/feed pipeline before a real
// cert lands; an unsigned release means SmartScreen warnings and NO updater
// signature verification for every user.
const allowUnsigned = process.env.VOLT_ALLOW_UNSIGNED === "1";

const cscLink = (process.env.WIN_CSC_LINK || process.env.CSC_LINK || "").trim();
if (!cscLink && !allowUnsigned) {
  console.error("❌ release requires a code-signing certificate (SmartScreen + updater signature verification).\n" +
    "   Set CSC_LINK (path or base64 of the .pfx) and CSC_KEY_PASSWORD, e.g.:\n" +
    "     CSC_LINK=C:\\certs\\volt.pfx CSC_KEY_PASSWORD=*** npm run release\n" +
    "   For unsigned dev/private builds use `npm run dist` instead.");
  process.exit(1);
}

if (allowUnsigned) {
  /* Actually build unsigned. This flag used to skip only the GUARD while
     electron-builder still signed from CSC_LINK, so the artifact carried a
     self-signed certificate and app-update.yml carried its publisherName —
     and electron-updater then REJECTED every downloaded update, because it
     requires Windows to report the signature as Valid and a self-signed cert
     always reports UnknownError (untrusted root). The result: an update that
     downloaded 121 MB in the background and was silently discarded, on every
     release, for every tester. Unsigned means NO publisherName in
     app-update.yml, so verification is skipped and updates install.
     SmartScreen warns either way; a self-signed identity anyone can forge was
     never a real control. Drop this flag the day a commercial cert lands. */
  delete process.env.CSC_LINK;
  delete process.env.WIN_CSC_LINK;
  delete process.env.CSC_KEY_PASSWORD;
  delete process.env.WIN_CSC_KEY_PASSWORD;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  console.warn([
    "! UNSIGNED RELEASE (VOLT_ALLOW_UNSIGNED=1) - building with NO certificate.",
    "  SmartScreen will warn on first launch, and the updater performs no publisher",
    "  verification. This is the deliberate beta posture: a self-signed certificate",
    "  made auto-update fail silently on every release.",
  ].join("\n"));
} else {
  // A configured cert is not enough: refuse to publish with a SELF-SIGNED
  // certificate (SmartScreen for every user + the updater rejects untrusted
  // chains, so every auto-update would fail), an expired cert, or one without
  // a private key — see signing-setup.cjs check-release.
  const certCheck = spawnSync(process.execPath, [join(__dirname, "signing-setup.cjs"), "check-release"], { stdio: "inherit" });
  if (certCheck.status !== 0) {
    console.error("❌ release aborted by the certificate guard.");
    process.exit(certCheck.status === null ? 1 : certCheck.status);
  }
}

const extraArgs = process.argv.slice(2);
console.log(allowUnsigned
  ? "· building UNSIGNED (scratch mode — no publisher verification will be active)"
  : "· signing release with certificate from CSC_LINK (publisher verification will be active)");

// shell:true on win32 — spawning npx.cmd directly EINVALs on modern Node
const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx",
  ["electron-builder", "--win", "nsis", "--publish", "always", ...extraArgs],
  { stdio: "inherit", timeout: 15 * 60 * 1000, shell: process.platform === "win32" });
/* electron-builder uploads a release's assets concurrently and each uploader
   decides for itself whether the release needs creating. They race: one wins,
   the others 422, and the run exits non-zero having uploaded only SOME files.
   Twice that left a published release with the installer but no latest.yml —
   a working download page and a 404 update feed, which is the worse half to
   lose because nothing looks wrong from outside. Reconcile before deciding
   whether the release actually failed. */
const finish = spawnSync(process.execPath, [join(__dirname, "finish-release.cjs")], { stdio: "inherit" });
if (r.status !== 0 && finish.status === 0) {
  console.log("· electron-builder exited " + r.status + ", but the release reconciled cleanly.");
} else if (r.status !== 0) {
  console.error("❌ electron-builder failed (status " + r.status + ") and the release is incomplete");
  process.exit(r.status === null ? 1 : r.status);
} else if (finish.status !== 0) {
  console.error("❌ the published release is incomplete — see above");
  process.exit(1);
}

if (allowUnsigned) {
  /* An unsigned release is only useful if it really is unsigned: the moment a
     certificate sneaks back in, app-update.yml regains its publisherName and
     electron-updater silently discards every downloaded update again — with no
     symptom anyone would notice. Assert the posture rather than trust it. */
  const yml = join(__dirname, "..", "dist", "win-unpacked", "resources", "app-update.yml");
  let posture = "app-update.yml not found at " + yml;
  if (existsSync(yml)) {
    const text = readFileSync(yml, "utf8");
    posture = /(^|\n)publisherName:/.test(text)
      ? "app-update.yml still carries publisherName — updates WILL be rejected"
      : null;
  }
  if (posture) {
    console.error("❌ unsigned release is not actually unsigned: " + posture);
    process.exit(1);
  }
  console.log("✓ unsigned build published — no publisherName in app-update.yml, so the");
  console.log("  updater will accept it. sign:check skipped by design.");
  process.exit(0);
}

const check = spawnSync(process.execPath, [join(__dirname, "check-signing.cjs")], { stdio: "inherit" });
process.exit(check.status === 0 ? 0 : 1);
