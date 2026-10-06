// Unit tests for pdf-sign.js (Volt.Sign): the pure-JS TripleDES against
// Node's crypto, PKCS#12 parsing + the full sign → re-verify chain against
// the LOCAL dev signing PFX (certs/volt-dev.pfx — gitignored, so the suite
// soft-skips the cert-dependent half on machines without it; CI stays green
// either way). Usage: node scripts/test-sign.mjs
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const src = readFileSync(join(__dirname, "..", "js", "pdf-sign.js"), "utf8");
const fn = new Function("window", "global", "Utils", src);
fn(globalThis, globalThis, globalThis.Utils);
const Sign = globalThis.Volt.Sign;

/* pdf-sign.js reads global.PDFLib, so the suite has to provide it — ONCE, here,
   rather than as a side effect of a test that might not run. It used to be
   assigned inside the block guarded by "is certs/volt-dev.pfx present?", which
   is true on a maintainer's machine and false on CI and on any fresh clone. So
   the later OpenSSL-PFX signing test passed locally and failed everywhere else
   with "Cannot destructure property 'PDFDocument' of 'global.PDFLib'" — a test
   depending on another test's leftovers, not a defect in the product. */
const pdfLibMod = await import("file:///" +
  join(__dirname, "..", "vendor", "pdf-lib.min.js").replace(/\\/g, "/"));
globalThis.PDFLib = pdfLibMod.default || pdfLibMod;

let pass = 0, fail = 0, skip = 0;
const t = (name, cond) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } };
const tSkip = (name) => { skip++; console.log("  ⤼ " + name + " (skipped)"); };

console.log("pdf-sign.js unit tests");

// ── TripleDES vs Node crypto ──
(() => {
  const key = crypto.randomBytes(24);
  const iv = crypto.randomBytes(8);
  const data = crypto.randomBytes(64);
  const cipher = crypto.createCipheriv("des-ede3-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const mine = Sign._unpad(Sign._des3.cbcDecrypt(new Uint8Array(key), new Uint8Array(iv), new Uint8Array(encrypted)));
  t("3DES-CBC decrypt matches Node crypto", Buffer.compare(Buffer.from(mine), data) === 0);
  // empty-padding boundary: a full-block plaintext (padding adds a block)
  const data2 = crypto.randomBytes(8);
  const c2 = crypto.createCipheriv("des-ede3-cbc", key, iv);
  const enc2 = Buffer.concat([c2.update(data2), c2.final()]);
  const dec2 = Sign._unpad(Sign._des3.cbcDecrypt(new Uint8Array(key), new Uint8Array(iv), new Uint8Array(enc2)));
  t("3DES-CBC decrypt full-block matches", Buffer.compare(Buffer.from(dec2), data2) === 0);
})();

// ── RC2 (RFC 2268) — older Windows/Java PFX exports encrypt with RC2-40 ──
(() => {
  // RFC 2268 §5 vector: key ff×8, 64 effective bits, plaintext ff×8
  const out = new Uint8Array(8);
  Sign._rc2.decryptBlock(Sign._rc2.expand(Buffer.from("ffffffffffffffff", "hex"), 64),
    Buffer.from("278b27e42e2f0d49", "hex"), 0, out, 0);
  t("RC2 decrypts the RFC 2268 known-answer vector", Buffer.from(out).toString("hex") === "ffffffffffffffff");
  /* A frozen RC2-40-CBC vector, produced by OpenSSL's own RC2. Node only exposes
     RC2 behind --openssl-legacy-provider, which a runner's Node may not ship, so
     this vector is what still proves the 40-bit path when the live comparison
     below cannot run. */
  const pt = Buffer.from("Volt RC2-40 known-answer vector, two+ blocks");
  const ct = Buffer.from("e4a00319caf53f50f5e5109d08732d1625e2c093b429b7df3c620cb120da4fe8b4bdabc9cdf6544dd41d5c32b84a16a1", "hex");
  const mine = Sign._unpad(Sign._rc2.cbcDecrypt(new Uint8Array([1, 2, 3, 4, 5]), 40,
    new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), new Uint8Array(ct)));
  t("RC2-40-CBC decrypts OpenSSL's frozen vector", Buffer.compare(Buffer.from(mine), pt) === 0);
  // live comparison against OpenSSL across random keys, IVs and lengths
  // (including a full-block plaintext, where padding adds a whole block)
  const cases = [8, 1, 7, 9, 64, 1213].map((n) => ({
    key: crypto.randomBytes(5).toString("hex"), iv: crypto.randomBytes(8).toString("hex"),
    pt: crypto.randomBytes(n).toString("hex"),
  }));
  let ref = null;
  try {
    ref = JSON.parse(execFileSync(process.execPath, ["--openssl-legacy-provider", "-e",
      "const c=require('crypto');const cs=JSON.parse(process.argv[1]);process.stdout.write(JSON.stringify(cs.map((x)=>{const e=c.createCipheriv('rc2-40-cbc',Buffer.from(x.key,'hex'),Buffer.from(x.iv,'hex'));return Buffer.concat([e.update(Buffer.from(x.pt,'hex')),e.final()]).toString('hex')})))",
      JSON.stringify(cases)], { encoding: "utf8" }));
  } catch { /* no legacy provider in this Node */ }
  if (!ref) {
    tSkip("RC2-40-CBC decrypt matches Node crypto — this Node has no legacy provider");
  } else {
    const ok = cases.every((x, i) => {
      const dec = Sign._unpad(Sign._rc2.cbcDecrypt(new Uint8Array(Buffer.from(x.key, "hex")), 40,
        new Uint8Array(Buffer.from(x.iv, "hex")), new Uint8Array(Buffer.from(ref[i], "hex"))));
      return Buffer.from(dec).toString("hex") === x.pt;
    });
    t("RC2-40-CBC decrypt matches Node crypto (6 random keys and lengths)", ok);
  }
})();

// ── A committed RC2-40 PFX: the PKCS#12 path must not depend on the runner ──
/* The legacy-export checks further down mint fresh PFXs with `openssl -legacy`,
   and the 2-core CI runner's openssl has no legacy provider, so there they skip
   (seen 2026-10-06). This throwaway certificate - both bags under RC2-40,
   password volt-test-pass, trusted by nothing - runs everywhere. Its key and
   certificate are pinned by SHA-256 of what openssl wrote, not stored, so no
   private key sits in the tree in a form a secret scanner would block. */
{
  const pfx = new Uint8Array(Buffer.from([
    "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",
  ].join(""), "base64"));
  const sha = (u8) => crypto.createHash("sha256").update(u8).digest("hex");
  let fx = null;
  try { fx = await Sign.parsePfx(pfx, "volt-test-pass"); } catch (e) { console.log("      error: " + e.message); }
  t("committed RC2-40 PFX: key byte-for-byte (SHA-256 pinned)",
    !!fx && sha(fx.key) === "f341b2c3f18ca1667ee23780a4892e1170106cfdd14e65f096d3ddbc4c3bdaa7");
  t("committed RC2-40 PFX: certificate byte-for-byte (SHA-256 pinned)",
    !!fx && sha(fx.signer) === "8e81b0006306cc60157f8107fcb0d28c650ce5e1d7700251b788ab868cfc6226");
  let fxWrong = false;
  try { await Sign.parsePfx(pfx, "definitely-wrong"); } catch (e) { fxWrong = /password/i.test(e.message); }
  t("committed RC2-40 PFX: wrong password is rejected (MAC)", fxWrong);
  try {
    const doc = await globalThis.PDFLib.PDFDocument.create();
    doc.addPage([400, 300]);
    const signed = await Sign.signPdf(await doc.save({ useObjectStreams: false }),
      { pfxBytes: pfx, password: "volt-test-pass", page: 1, reason: "RC2-40 fixture" });
    t("committed RC2-40 PFX: signs a PDF", Buffer.from(signed).toString("latin1").includes("/adbe.pkcs7.detached"));
  } catch (e) {
    t("committed RC2-40 PFX: signs a PDF", false);
    console.log("      error: " + e.message);
  }
}

// ── RFC 3161 timestamp request structure (pure ASN.1, no network) ──
(() => {
  const imprint = crypto.createHash("sha256").update("volt tsa unit").digest();
  const req = Sign.buildTimestampRequest(new Uint8Array(imprint));
  const walk = (buf, off = 0) => {
    const tag = buf[off];
    let len = buf[off + 1], o = off + 2;
    if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | buf[o++]; }
    return { tag, len, content: buf.subarray(o, o + len), next: o + len };
  };
  const kidsOf = (u8) => { const out = []; let p = 0; while (p < u8.length) { const k = walk(u8.subarray(p), 0); out.push(k); p += k.next; } return out; };
  const top = walk(req, 0);
  const kids = kidsOf(top.content);
  t("TimestampReq is a SEQUENCE with version 1", kids[0] && kids[0].tag === 0x02 && kids[0].content[0] === 1);
  const mi = kidsOf(kids[1].content);
  const alg = kidsOf(mi[0].content);
  t("TimestampReq messageImprint is SHA-256 over the imprint bytes",
    alg[0].tag === 0x06 && mi[1].tag === 0x04 && mi[1].len === 32 &&
    Buffer.compare(Buffer.from(mi[1].content), imprint) === 0);
  // RFC 3161 field order: nonce INTEGER comes BEFORE certReq BOOLEAN
  const nonce = kids[2], certReq = kids[3];
  t("TimestampReq nonce precedes certReq (RFC 3161 field order)",
    nonce && nonce.tag === 0x02 && certReq && certReq.tag === 0x01 && certReq.content[0] === 0xff);
})();

// ── PKCS#12 + full signing chain (needs the local dev PFX) ──
const certsDir = join(__dirname, "..", "certs");
const pfxPath = join(certsDir, "volt-dev.pfx");
if (!existsSync(pfxPath)) {
  tSkip("parsePfx on certs/volt-dev.pfx (not present)");
  tSkip("signPdf → /Sig + /ByteRange + cryptographic re-verify (not present)");
  tSkip("wrong PFX password is rejected (not present)");
} else {
  const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
  const pwMatch = /^CSC_KEY_PASSWORD=(.*)$/m.exec(env);
  const password = pwMatch ? pwMatch[1].trim() : "";

  (async () => {
    const pfxBytes = new Uint8Array(readFileSync(pfxPath));
    let parsed;
    try {
      parsed = await Sign.parsePfx(pfxBytes, password);
    } catch (e) {
      t("parsePfx on certs/volt-dev.pfx", false);
      console.log("      error: " + e.message);
      finish();
      return;
    }
    t("parsePfx returns a PKCS#8 key + certs", !!parsed.key && Array.isArray(parsed.certs) && parsed.certs.length >= 1 && !!parsed.signer);
    t("parsed key imports as RSASSA key (Node)", (() => {
      try { crypto.createPrivateKey({ key: Buffer.from(parsed.key), format: "der", type: "pkcs8" }); return true; } catch (e) { return false; }
    })());
    t("signer cert parses as X.509 (Node)", (() => {
      try { const c = new crypto.X509Certificate(Buffer.from(parsed.signer)); return c.subject && c.serialNumber; } catch (e) { return false; }
    })());

    // wrong password must fail cleanly via the MAC check
    let wrongRejected = false;
    try { await Sign.parsePfx(pfxBytes, "definitely-wrong"); } catch (e) { wrongRejected = /password/i.test(e.message); }
    t("wrong PFX password is rejected (MAC)", wrongRejected);

    // ── full sign → verify round-trip ──
    const mLib = await import("file:///" + join(__dirname, "..", "vendor", "pdf-lib.min.js").replace(/\\/g, "/") + "?t=sign1");
    const PDFLib = mLib.default || mLib;
    globalThis.PDFLib = PDFLib;
    const doc = await PDFLib.PDFDocument.create();
    const helv = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    doc.addPage([400, 300]).drawText("E-SIGN PROBE LINE", { x: 40, y: 220, size: 14, font: helv });
    const srcBytes = await doc.save({ useObjectStreams: false });

    let signed;
    try {
      signed = await Sign.signPdf(srcBytes, { pfxBytes, password, page: 1, reason: "Unit test" });
    } catch (e) {
      t("signPdf produces a signed PDF", false);
      console.log("      error: " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 4).join("\n"));
      finish();
      return;
    }
    t("signPdf produces a signed PDF", !!signed && signed.byteLength > srcBytes.byteLength);
    const src = Buffer.from(signed).toString("latin1");
    t("contains /Filter /Adobe.PPKLite", src.includes("/Adobe.PPKLite"));
    t("contains /SubFilter /adbe.pkcs7.detached", src.includes("/adbe.pkcs7.detached"));
    t("contains /Sig field", src.includes("/Subtype /Widget") && src.includes("/FT /Sig"));

    // re-verify the signature cryptographically: parse the CMS out of
    // /Contents, walk it with a minimal DER reader, recompute the digest over
    // the /ByteRange, and check BOTH the RSA signature (over the signed
    // attributes, with the leaf cert from the CMS) and the messageDigest
    // attribute value.
    let verify = { ok: false };
    try {
      const br = /\/ByteRange \[(\d+) (\d+) (\d+) (\d+)\]/.exec(src);
      const ct = /\/Contents <([0-9a-fA-F]+)>/.exec(src);
      if (br && ct) {
        // /ByteRange [start1 len1 start2 len2] — covered = [start1,start1+len1) ∪ [start2,start2+len2)
        const s1 = Number(br[1]), l1 = Number(br[2]), s2 = Number(br[3]), l2 = Number(br[4]);
        const walk = (buf, off = 0) => {
          const tag = buf[off];
          let len = buf[off + 1], o = off + 2;
          if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | buf[o++]; }
          return { tag, len, content: buf.subarray(o, o + len), next: o + len };
        };
        const kidsOf = (u8) => { const out = []; let p = 0; while (p < u8.length) { const k = walk(u8.subarray(p), 0); out.push(k); p += k.next; } return out; };
        const cms = Buffer.from(ct[1], "hex");
        // the CMS DER must be internally consistent — every TLV stays within
        // its parent (this catches a zeroed/garbled inner length; BouncyCastle
        // rejects such files outright)
        let derConsistent = true;
        const derWalk = (u8, off, limit) => {
          let o = off;
          while (o < limit && derConsistent) {
            if (o + 2 > limit) { derConsistent = false; return; }
            const k = walk(u8.subarray(o), 0);
            if (o + k.next > limit) { derConsistent = false; return; }
            if (k.tag === 0x30 || k.tag === 0x31 || k.tag === 0xa0) {
              // recurse into the CONTENT — skip the full header (k.next - k.len
              // bytes), not a fixed 2, so long-form lengths walk correctly
              derWalk(u8.subarray(o + k.next - k.len, o + k.next), 0, k.len);
            }
            o += k.next;
          }
        };
        derWalk(cms, 0, cms.length);
        t("CMS DER is internally consistent", derConsistent);
        const ci = walk(cms);                              // ContentInfo
        const sd = kidsOf(ci.content).find((k) => k.tag === 0xa0); // [0] EXPLICIT SignedData
        const sdInner = walk(sd.content, 0);               // the SignedData SEQUENCE itself
        const sdKids = kidsOf(sdInner.content);            // version, algs, encap, [0]certs, SET signerInfos
        const certBlock = sdKids.find((k) => k.tag === 0xa0);
        const signerInfos = sdKids.filter((k) => k.tag === 0x31).pop(); // LAST 0x31 = signerInfos (first is digestAlgorithms)
        // certificates is [0] IMPLICIT CertificateSet — the content is the
        // cert SEQUENCEs directly (no nested SET tag)
        const certTlvs = kidsOf(certBlock.content);
        const leafDer = certBlock.content.subarray(0, certTlvs[0].next);
        const xcert = new crypto.X509Certificate(Buffer.from(leafDer));
        const si = kidsOf(signerInfos.content).find((k) => k.tag === 0x30);
        const siKids = kidsOf(si.content);
        const signedAttrs = siKids.find((k) => k.tag === 0xa0);
        const signature = siKids.find((k) => k.tag === 0x04);
        const covered = Buffer.concat([signed.subarray(s1, s1 + l1), signed.subarray(s2, s2 + l2)]);
        const digest = crypto.createHash("sha256").update(covered).digest();
        // the signature input is the DER SET OF Attribute (0x31 + length over
        // the implicit attr content) — RFC 5652 §5.4, the [0] tag excluded
        const attrItems = signedAttrs.content;
        const l = attrItems.length;
        const lenB = l < 0x80 ? [l] : l < 0x100 ? [0x81, l] : [0x82, (l >> 8) & 0xff, l & 0xff];
        const sigInput = Buffer.concat([Buffer.from([0x31, ...lenB]), Buffer.from(attrItems)]);
        const okSig = crypto.verify("sha256", sigInput, xcert.publicKey, Buffer.from(signature.content));
        let mdOk = false;
        for (const attr of kidsOf(signedAttrs.content)) { // attributes directly (implicit)
          for (const part of kidsOf(attr.content)) {
            const values = part.tag === 0x31 ? kidsOf(part.content) : [part]; // descend into the SET OF values
            for (const inner of values) {
              if (inner.tag === 0x04 && inner.len === 32 && Buffer.compare(Buffer.from(inner.content), digest) === 0) mdOk = true;
            }
          }
        }
        verify = { ok: okSig && mdOk, sigOk: okSig, mdOk };
      }
    } catch (e) {
      verify = { ok: false, err: e.message };
    }
    t("signature cryptographically verifies (RSA + messageDigest)", verify.ok === true);

    // the signed file still loads through pdf-lib + pdf.js
    let reloads = false;
    try {
      const re = await PDFLib.PDFDocument.load(signed, { ignoreEncryption: true });
      reloads = re.getPageCount() === 1;
    } catch (e) { reloads = false; }
    t("signed PDF reloads via pdf-lib", reloads);

    runOpensslPfx();
  })().catch((e) => { t("signing chain runs without throwing", false); console.log("      error: " + e.message); runOpensslPfx(); });
}

// ── OpenSSL 3 export support (HMAC-SHA-256 MAC + PBES2 AES-256-CBC) ──
// OpenSSL 3's default pkcs12 export uses a SHA-256 MAC and PBES2 with the
// RAW password bytes — the classic SHA-1 / UTF-16BE assumptions reject such
// PFXs even with the correct password. Mint an ephemeral PFX and prove the
// parse + sign chain (SHA-256 MAC, SHA-256 PBKDF2 PRF, UTF-8 password
// fallback). Soft-skips without openssl.
async function runOpensslPfx() {
  let opensslOk = true;
  try { execFileSync("openssl", ["version"], { stdio: "ignore" }); } catch { opensslOk = false; }
  if (!opensslOk) {
    tSkip("ephemeral OpenSSL-3 PFX (SHA-256 MAC + PBES2) — openssl not available");
    finish();
    return;
  }
  const work = mkdtempSync(join(tmpdir(), "volt-sign-openssl-"));
  try {
    const keyPem = join(work, "key.pem"), certPem = join(work, "cert.pem"), pfxPath2 = join(work, "cert.pfx");
    const password = "volt-test-pass";
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPem, "-out", certPem,
      "-days", "1", "-nodes", "-subj", "/CN=Volt OpenSSL Test", "-sha256"], { stdio: "ignore" });
    execFileSync("openssl", ["pkcs12", "-export", "-out", pfxPath2, "-inkey", keyPem, "-in", certPem,
      "-passout", "pass:" + password], { stdio: "ignore" });
    const pfxBytes = new Uint8Array(readFileSync(pfxPath2));

    let parsed;
    try {
      parsed = await Sign.parsePfx(pfxBytes, password);
    } catch (e) {
      t("parsePfx on an OpenSSL-3 PFX (SHA-256 MAC, PBES2 AES-256)", false);
      console.log("      error: " + e.message);
      finish();
      return;
    }
    t("parsePfx on an OpenSSL-3 PFX (SHA-256 MAC, PBES2 AES-256)", !!parsed.key && parsed.certs.length >= 1);

    let wrongRejected = false;
    try { await Sign.parsePfx(pfxBytes, "definitely-wrong"); } catch (e) { wrongRejected = /password/i.test(e.message); }
    t("OpenSSL-3 PFX wrong password is rejected (MAC)", wrongRejected);

    /* The key must come back BYTE-FOR-BYTE. Parsing "succeeding" proved
       nothing here: with a single self-signed certificate parsePfx never
       imports the key, so a corrupted one sailed through and only blew up
       later, at signing, as an unexplained "Invalid keyData". */
    const truePkcs8 = new Uint8Array(Buffer.from(
      readFileSync(keyPem, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"));
    t("parsePfx returns the private key byte-for-byte",
      parsed.key.length === truePkcs8.length && parsed.key.every((b, i) => b === truePkcs8[i]));

    /* The regression this guards. Web Crypto's AES-CBC decrypt already strips
       the PKCS#7 padding; the PBES2 branch stripped it a SECOND time, cutting
       real bytes off any key whose DER ended in a byte 1..16 — roughly one
       certificate in sixteen, and permanently for that certificate. A single
       minted key only hits it 1-in-16 of the time, so mint until one lands in
       the danger zone rather than leaving the case to chance. */
    let danger = null;
    for (let i = 0; i < 40 && !danger; i++) {
      const k = join(work, `dz-key${i}.pem`), c = join(work, `dz-cert${i}.pem`), p = join(work, `dz${i}.pfx`);
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", k, "-out", c,
        "-days", "1", "-nodes", "-subj", "/CN=Volt Padding Probe", "-sha256"], { stdio: "ignore" });
      const der = new Uint8Array(Buffer.from(
        readFileSync(k, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"));
      const last = der[der.length - 1];
      if (last >= 1 && last <= 16) {
        execFileSync("openssl", ["pkcs12", "-export", "-out", p, "-inkey", k, "-in", c,
          "-passout", "pass:" + password], { stdio: "ignore" });
        danger = { pfx: new Uint8Array(readFileSync(p)), der, last };
      }
    }
    if (!danger) {
      tSkip("a key whose DER ends in 1..16 survives the PBES2 path — none minted in 40 tries");
    } else {
      let dzKey = null;
      try { dzKey = (await Sign.parsePfx(danger.pfx, password)).key; } catch (e) { /* reported below */ }
      t("a key whose DER ends in 1..16 is not truncated by a second unpad",
        !!dzKey && dzKey.length === danger.der.length && dzKey.every((b, i) => b === danger.der[i]));
    }

    // the full sign → structural round-trip (the PDFBox gate does the
    // cryptographic external re-verify)
    try {
      const mLib2 = await import("file:///" + join(__dirname, "..", "vendor", "pdf-lib.min.js").replace(/\\/g, "/") + "?t=sign2");
      const PDFLib2 = mLib2.default || mLib2;
      const doc2 = await PDFLib2.PDFDocument.create();
      const helv2 = await doc2.embedFont(PDFLib2.StandardFonts.Helvetica);
      doc2.addPage([400, 300]).drawText("OPENSSL PFX PROBE", { x: 40, y: 220, size: 14, font: helv2 });
      const src2 = await doc2.save({ useObjectStreams: false });
      const signed2 = await Sign.signPdf(src2, { pfxBytes, password, page: 1, reason: "OpenSSL PFX test" });
      const s2 = Buffer.from(signed2).toString("latin1");
      t("OpenSSL-3 PFX signs a PDF with /Sig + /ByteRange",
        s2.includes("/adbe.pkcs7.detached") && /\/ByteRange \[\d+ \d+ \d+ \d+\]/.test(s2));
    } catch (e) {
      t("OpenSSL-3 PFX signs a PDF with /Sig + /ByteRange", false);
      console.log("      error: " + e.message);
    }

    /* ── Legacy exports: the certificate bag under RC2-40 ──
       `-legacy` writes what older Windows and Java exporters write: a SHA-1
       MAC, the certificate bag under pbeWithSHAAnd40BitRC2-CBC and the key
       under 3DES. Until 2026-10 Volt refused these outright. The second shape
       puts the KEY under RC2-40 too, so the key bytes themselves cross the RC2
       path, not just the certificate. */
    const truthCert = new Uint8Array(Buffer.from(
      readFileSync(certPem, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"));
    for (const [label, extra] of [
      ["legacy PFX (RC2-40 certificate bag, 3DES key)", []],
      ["legacy PFX with the key under RC2-40 too", ["-keypbe", "PBE-SHA1-RC2-40", "-certpbe", "PBE-SHA1-RC2-40"]],
    ]) {
      const lp = join(work, "legacy-" + extra.length + ".pfx");
      try {
        execFileSync("openssl", ["pkcs12", "-export", "-legacy", ...extra, "-out", lp, "-inkey", keyPem,
          "-in", certPem, "-passout", "pass:" + password], { stdio: "ignore" });
      } catch {
        tSkip(label + " — this openssl has no legacy provider");
        continue;
      }
      const lb = new Uint8Array(readFileSync(lp));
      let lr = null;
      try { lr = await Sign.parsePfx(lb, password); } catch (e) { console.log("      error: " + e.message); }
      t(label + ": key byte-for-byte",
        !!lr && lr.key.length === truePkcs8.length && lr.key.every((b, i) => b === truePkcs8[i]));
      t(label + ": certificate byte-for-byte",
        !!lr && lr.signer.length === truthCert.length && lr.signer.every((b, i) => b === truthCert[i]));
      let lWrong = false;
      try { await Sign.parsePfx(lb, "definitely-wrong"); } catch (e) { lWrong = /password/i.test(e.message); }
      t(label + ": wrong password is rejected (MAC)", lWrong);
      if (!extra.length) {
        try {
          const mLib3 = await import("file:///" + join(__dirname, "..", "vendor", "pdf-lib.min.js").replace(/\\/g, "/") + "?t=sign3");
          const PDFLib3 = mLib3.default || mLib3;
          const doc3 = await PDFLib3.PDFDocument.create();
          doc3.addPage([400, 300]);
          const signed3 = await Sign.signPdf(await doc3.save({ useObjectStreams: false }), { pfxBytes: lb, password, page: 1, reason: "RC2-40 PFX test" });
          t(label + ": signs a PDF", Buffer.from(signed3).toString("latin1").includes("/adbe.pkcs7.detached"));
        } catch (e) {
          t(label + ": signs a PDF", false);
          console.log("      error: " + e.message);
        }
      }
    }

    // ── RFC 3161 timestamp token from a local OpenSSL TSA (hermetic) ──
    try {
      // a TSA needs a certificate with the critical timeStamping EKU
      const tsaKey = join(work, "tsa-key.pem"), tsaCert = join(work, "tsa-cert.pem");
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", tsaKey, "-out", tsaCert,
        "-days", "1", "-nodes", "-subj", "/CN=Volt Unit Test TSA", "-sha256",
        "-addext", "extendedKeyUsage=critical,timeStamping"], { cwd: work, stdio: "ignore" });
      writeFileSync(join(work, "tsa_serial"), "01");
      const tsaCnf = join(work, "tsa.cnf");
      writeFileSync(tsaCnf, "default_tsa = tsa\n\n[ tsa ]\ndefault_policy = 1.2.3.4.5.6.7\ndigests = sha256\nsigner_digest = sha256\naccuracy = secs:1\nordering = yes\ntsa_name = yes\ness_cert_id_chain = no\nserial = tsa_serial\ncrypto_device = builtin\n");
      const imprint = new Uint8Array(32).map((_, i) => i);
      const reqDer = join(work, "req.der");
      writeFileSync(reqDer, Buffer.from(Sign.buildTimestampRequest(imprint)));
      const respDer = join(work, "resp.der");
      execFileSync("openssl", ["ts", "-reply", "-config", tsaCnf, "-queryfile", reqDer,
        "-signer", tsaCert, "-inkey", tsaKey, "-out", respDer], { cwd: work, stdio: "ignore" });
      const token = Sign.parseTimestampResponse(new Uint8Array(readFileSync(respDer)));
      t("parseTimestampResponse returns the token from an OpenSSL TSA", token.length > 100);
      // embed it in a CMS via tsToken and sign a PDF with it
      const md = new Uint8Array(crypto.createHash("sha256").update("volt ts").digest());
      const cmsTs = await Sign.buildCms(md, {
        key: parsed.key, signerCert: parsed.signer, time: new Date(), tsToken: token,
      });
      const cmsHex = Buffer.from(cmsTs).toString("hex");
      t("buildCms embeds the signatureTimeStamp attribute (1.2.840.113549.1.9.16.2.14)",
        cmsHex.includes("2a864886f70d010910020e"));
      // the token must round-trip as a DER-consistent ContentInfo
      const w2 = (buf, off = 0) => {
        const tag = buf[off];
        let len = buf[off + 1], o = off + 2;
        if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | buf[o++]; }
        return { tag, len, content: buf.subarray(o, o + len), next: o + len };
      };
      const tk = w2(token, 0);
      t("timestamp token is a DER ContentInfo (SEQUENCE)", tk.tag === 0x30 && tk.next === token.length);
    } catch (e) {
      t("RFC 3161 token from a local OpenSSL TSA", false);
      console.log("      error: " + e.message);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  finish();
}

function finish() {
  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  process.exit(fail ? 1 : 0);
}
if (!existsSync(pfxPath)) runOpensslPfx();
