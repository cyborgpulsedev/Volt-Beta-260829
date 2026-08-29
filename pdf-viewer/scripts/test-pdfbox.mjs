// ═══════════════════════════════════════════════════════════════
// test-pdfbox.mjs — the "Acrobat / PDFBox" gate for Volt.Sign
//
// Signs a probe PDF with Volt.Sign (the dev PFX when present, otherwise an
// ephemeral openssl self-signed cert — so the gate runs hermetically in CI
// without the gitignored certs/ dir), then validates the output with an
// EXTERNAL stack that the in-repo Node tests cannot provide:
//
//   • Apache PDFBox 3 loads the file (strict xref/object parsing — catches
//     offsets broken by the signature byte surgery)
//   • the /Sig dictionary is checked (Filter/SubFilter, ByteRange must
//     reach EOF with the whole `<hex>` value excluded)
//   • BouncyCastle parses the CMS and cryptographically verifies it: the
//     SHA-256 messageDigest attribute vs the covered ByteRange content, and
//     the RSA signature over the DER-encoded signed attributes with the
//     signer certificate matched by issuer+serial.
//   • RFC 3161: the probe signs through a LOCAL timestamp authority — an
//     HTTP server backed by `openssl ts -reply` (hermetic, no external
//     network) — and the validator checks the signatureTimeStamp attribute:
//     the token parses, the TSA signature verifies against the TSA cert
//     carried in the token, and the TSTInfo messageImprint matches SHA-256
//     of the signed attributes minus the timestamp attribute (PAdES), so
//     the signature stays valid after the certificate expires.
//
// This gate exists because the internal re-verify in test-sign.mjs verified
// the RSA signature over the raw bytes — which Acrobat-style verifiers that
// RE-ENCODE the signed attributes in DER order (BouncyCastle) reject. Real
// bugs surfaced here: the ByteRange 4th element was an end offset instead of
// a length, /M + /Reason were serialized as PDF names instead of strings,
// the SignerInfo sid was zeroed (typed arrays in the ASN.1 builder), and
// the signed-attributes SET was not in DER order.
//
// Soft-skips (exit 0 with a note) when Java, openssl, or network access to
// Maven Central is unavailable — everything else is a hard failure.
//
// Usage: node scripts/test-pdfbox.mjs
//   PDFBOX_JAR_DIR   override the jar cache dir (default: OS temp dir)
// ═══════════════════════════════════════════════════════════════
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = join(__dirname, "..");

let pass = 0, fail = 0, skip = 0;
const t = (name, cond) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } };
const tSkip = (name) => { skip++; console.log("  ⤼ " + name + " (skipped)"); };

console.log("test-pdfbox — external PDFBox 3 + BouncyCastle signature validation");

/** Mint a local RFC 3161 TSA (cert with the critical timeStamping EKU + a
    minimal config) and serve it over HTTP with `openssl ts -reply`, so the
    real requestTimestamp fetch path runs hermetically — no external network.
    Returns the TSA endpoint URL. The work dir is cleaned up by the caller. */
async function setupLocalTsa(work) {
  const tsaKey = join(work, "tsa-key.pem"), tsaCert = join(work, "tsa-cert.pem");
  execFileSync(findOpenssl(), ["req", "-x509", "-newkey", "rsa:2048", "-keyout", tsaKey, "-out", tsaCert,
    "-days", "1", "-nodes", "-subj", "/CN=Volt CI Test TSA", "-sha256",
    "-addext", "extendedKeyUsage=critical,timeStamping"], { cwd: work, stdio: "ignore" });
  writeFileSync(join(work, "tsa_serial"), "01");
  writeFileSync(join(work, "tsa.cnf"), "default_tsa = tsa\n\n[ tsa ]\n" +
    "default_policy = 1.2.3.4.5.6.7\ndigests = sha256\nsigner_digest = sha256\n" +
    "accuracy = secs:1\nordering = yes\ntsa_name = yes\ness_cert_id_chain = no\n" +
    "serial = tsa_serial\ncrypto_device = builtin\n");
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const reqBin = join(work, "req.bin");
        writeFileSync(reqBin, Buffer.concat(chunks));
        const respBin = join(work, "resp.bin");
        execFileSync(findOpenssl(), ["ts", "-reply", "-config", join(work, "tsa.cnf"),
          "-queryfile", reqBin, "-signer", tsaCert, "-inkey", tsaKey, "-out", respBin], { cwd: work, stdio: "ignore" });
        res.writeHead(200, { "Content-Type": "application/timestamp-reply" });
        res.end(readFileSync(respBin));
      } catch (e) {
        res.writeHead(500);
        res.end(String(e.message || e));
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port + "/ts";
  console.log("  · local RFC 3161 TSA: " + url);
  return url;
}

function findOpenssl() {
  const candidates = ["openssl", "openssl.exe"];
  if (process.platform === "win32") {
    // Git for Windows ships openssl in usr/bin (on PATH in bash, but NOT in
    // a plain PowerShell step) — look there explicitly
    candidates.push(
      "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
      "C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe",
    );
  }
  for (const c of candidates) {
    try { execFileSync(c, ["version"], { stdio: "ignore" }); return c; } catch { /* try next */ }
  }
  return null;
}

function findJava() {
  const candidates = ["java", "java.exe"];
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, "bin", "java"), join(process.env.JAVA_HOME, "bin", "java.exe"));
  for (const c of candidates) {
    try { execFileSync(c, ["-version"], { stdio: "ignore" }); return c; } catch { /* try next */ }
  }
  return null;
}

async function main() {
  // ── locate Java ──
  const javaBin = findJava();
  if (!javaBin) {
    tSkip("Java available (needed to run PDFBox — install a JDK to enable this gate)");
    return;
  }
  console.log("  · java: " + javaBin);

  // ── ensure the PDFBox + BouncyCastle jars ──
  const JARS = {
    "pdfbox-app-3.0.4.jar": "https://repo1.maven.org/maven2/org/apache/pdfbox/pdfbox-app/3.0.4/pdfbox-app-3.0.4.jar",
    "bcprov-jdk18on-1.79.jar": "https://repo1.maven.org/maven2/org/bouncycastle/bcprov-jdk18on/1.79/bcprov-jdk18on-1.79.jar",
    "bcpkix-jdk18on-1.79.jar": "https://repo1.maven.org/maven2/org/bouncycastle/bcpkix-jdk18on/1.79/bcpkix-jdk18on-1.79.jar",
  };
  const jarDir = process.env.PDFBOX_JAR_DIR || join(tmpdir(), "volt-pdfbox-jars");
  mkdirSync(jarDir, { recursive: true });
  const cp = Object.keys(JARS).map((j) => join(jarDir, j));
  const missing = cp.filter((p) => !existsSync(p));
  if (missing.length) {
    console.log("  · fetching " + missing.length + " jar(s) from Maven Central into " + jarDir);
    for (const p of missing) {
      const name = p.split(/[\\/]/).pop();
      try {
        const res = await fetch(JARS[name]);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(p, buf);
        console.log("  · downloaded " + name + " (" + buf.length + " bytes)");
      } catch (e) {
        tSkip("download " + name + " (" + e.message + ") — offline? run again with network");
        return;
      }
    }
  }

  // ── signing identity: dev PFX when present, else ephemeral openssl cert ──
  let pfxBytes, password;
  const devPfx = join(root, "certs", "volt-dev.pfx");
  if (existsSync(devPfx)) {
    pfxBytes = new Uint8Array(readFileSync(devPfx));
    const env = readFileSync(join(root, ".env"), "utf8");
    const pwMatch = /^CSC_KEY_PASSWORD=(.*)$/m.exec(env);
    password = pwMatch ? pwMatch[1].trim() : "";
    console.log("  · signer: dev PFX (certs/volt-dev.pfx)");
  } else {
    // ephemeral self-signed cert via openssl — hermetic for CI (no certs/ there)
    const opensslBin = findOpenssl();
    if (!opensslBin) {
      tSkip("openssl available (needed to mint an ephemeral test cert — the dev PFX is not present)");
      return;
    }
    const work = mkdtempSync(join(tmpdir(), "volt-pdfbox-cert-"));
    try {
      const keyPem = join(work, "key.pem"), certPem = join(work, "cert.pem"), pfxPath = join(work, "cert.pfx");
      password = "volt-test-pass";
      execFileSync(opensslBin, ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPem, "-out", certPem,
        "-days", "1", "-nodes", "-subj", "/CN=Volt CI Signing Test", "-sha256"], { stdio: "ignore" });
      execFileSync(opensslBin, ["pkcs12", "-export", "-out", pfxPath, "-inkey", keyPem, "-in", certPem,
        "-passout", "pass:" + password], { stdio: "ignore" });
      pfxBytes = new Uint8Array(readFileSync(pfxPath));
      console.log("  · signer: ephemeral openssl self-signed cert (CI mode)");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  // ── hermetic RFC 3161 TSA: a local HTTP endpoint backed by `openssl ts
  //    -reply` (no external network) — exercises the real fetch path ──
  const tsaWork = mkdtempSync(join(tmpdir(), "volt-pdfbox-tsa-"));
  const tsaUrl = await setupLocalTsa(tsaWork);

  // ── sign a probe PDF with Volt.Sign (timestamped) ──
  const src = readFileSync(join(root, "js", "pdf-sign.js"), "utf8");
  new Function("window", "global", "Utils", src)(globalThis, globalThis, globalThis.Utils);
  const Sign = globalThis.Volt.Sign;

  const mLib = await import("file:///" + join(root, "vendor", "pdf-lib.min.js").replace(/\\/g, "/") + "?t=pdfbox1");
  const PDFLib = mLib.default || mLib;
  globalThis.PDFLib = PDFLib;

  const doc = await PDFLib.PDFDocument.create();
  const helv = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText("PDFBOX VALIDATION PROBE", { x: 40, y: 220, size: 14, font: helv });
  const srcBytes = await doc.save({ useObjectStreams: false });

  let signed;
  try {
    signed = await Sign.signPdf(srcBytes, {
      pfxBytes, password, page: 1,
      reason: "PDFBox validation probe",
      // "now" — BouncyCastle rejects a signingTime before the cert's
      // notBefore (an ephemeral CI cert is minted seconds earlier)
      time: new Date(),
      // RFC 3161: the signatureTimeStamp attribute keeps the signature valid
      // after the cert expires; the TSA token is fetched over HTTP from the
      // local server above
      tsaUrl,
    });
  } catch (e) {
    t("Volt.Sign signs a probe PDF (timestamped)", false);
    console.log("      error: " + e.message);
    rmSync(tsaWork, { recursive: true, force: true });
    return;
  }
  t("Volt.Sign signs a probe PDF (RFC 3161 timestamped)", signed.byteLength > srcBytes.byteLength);

  // ── compile + run the external validator ──
  const work = mkdtempSync(join(tmpdir(), "volt-pdfbox-"));
  let javaResult = "failed";
  try {
    const signedPath = join(work, "signed.pdf");
    writeFileSync(signedPath, Buffer.from(signed));
    const javaSrc = readFileSync(join(__dirname, "pdfbox-validate", "ValidateSignature.java"), "utf8");
    writeFileSync(join(work, "ValidateSignature.java"), javaSrc);
    const classpath = [".", ...cp].join(process.platform === "win32" ? ";" : ":");
    // single-file source launch: compiles in memory, honors -cp
    execFileSync(javaBin, ["-cp", classpath, "ValidateSignature.java", signedPath], { cwd: work, stdio: ["ignore", "inherit", "inherit"] });
    javaResult = "clean";
  } catch (e) {
    javaResult = "failed";
  }
  t("external PDFBox + BouncyCastle validation is clean (incl. timestamp checks)", javaResult === "clean");
  rmSync(work, { recursive: true, force: true });
  rmSync(tsaWork, { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("test-pdfbox crashed: " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 4).join("\n"));
  process.exit(1);
});
