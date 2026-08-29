import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;

import org.bouncycastle.asn1.ASN1Encodable;
import org.bouncycastle.asn1.ASN1EncodableVector;
import org.bouncycastle.asn1.ASN1GeneralizedTime;
import org.bouncycastle.asn1.ASN1Integer;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1OctetString;
import org.bouncycastle.asn1.ASN1Primitive;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.ASN1Set;
import org.bouncycastle.asn1.DERSet;
import org.bouncycastle.asn1.cms.Attribute;
import org.bouncycastle.asn1.cms.AttributeTable;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cms.CMSException;
import org.bouncycastle.cms.CMSProcessable;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.SignerInformationVerifier;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.util.Store;

import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Enumeration;

import java.io.File;
import java.nio.file.Files;
import java.security.Security;
import java.util.Collection;
import java.util.Date;

/**
 * External stricter validation of a Volt.Sign-produced PDF (the "Acrobat /
 * PDFBox" check that the in-repo Node tests cannot provide):
 *
 *   1. Apache PDFBox 3 loads the document — its strict xref/object parser
 *      rejects a file whose offsets were broken by byte surgery.
 *   2. The signature dictionary is inspected: /Filter + /SubFilter, and the
 *      /ByteRange must be [0 len1 off2 len2] with range 2 ending exactly at
 *      EOF (range 1 covers [0,off2), range 2 covers [off2,EOF), and the gap
 *      between them is the whole `<hex>` value including its delimiters —
 *      the convention Acrobat's own signatures use and what PDFBox's
 *      /Contents extraction expects).
 *   3. BouncyCastle parses the CMS SignedData and cryptographically verifies
 *      it: SHA-256 of the covered ByteRange content must equal the
 *      messageDigest signed attribute, and the RSA signature over the
 *      DER-encoded signed attributes must verify with the signer certificate
 *      found in the CMS (matched by issuer + serial).
 *   4. If a PAdES signatureTimeStamp attribute (RFC 3161) is present, the
 *      timestamp token is verified: it must parse as a CMS SignedData, the
 *      TSA signature must verify against the TSA certificate carried inside
 *      the token, and the TSTInfo messageImprint must equal SHA-256 of the
 *      signed attributes EXCLUDING the timestamp attribute — the convention
 *      that lets a signature stay valid after the certificate expires.
 *
 * Exits 0 only when everything passes; prints every finding otherwise.
 */
public class ValidateSignature {

  static int issues = 0;

  static void flag(String msg) {
    issues++;
    System.out.println("  FAIL " + msg);
  }

  static void ok(String msg) {
    System.out.println("  ok   " + msg);
  }

  /** Verify the PAdES signatureTimeStamp attribute (RFC 3161) when present:
   *  the token must parse as a CMS SignedData, its TSA signature must verify
   *  against the TSA certificate carried inside the token, and the token's
   *  TSTInfo messageImprint must equal SHA-256 of the signed attributes
   *  EXCLUDING the timestamp attribute (ETSI TS 102 778 / PAdES convention —
   *  a verifier accepts the signature as made at the token's genTime, so it
   *  stays valid after the signer certificate expires). */
  static void verifyTimestamp(SignerInformation si) throws Exception {
    AttributeTable table = si.getSignedAttributes();
    ASN1ObjectIdentifier tsOid = new ASN1ObjectIdentifier("1.2.840.113549.1.9.16.2.14");
    Attribute tsAttr = table.get(tsOid);
    if (tsAttr == null) {
      System.out.println("  · no RFC 3161 signatureTimeStamp attribute (signature valid only until the cert expires)");
      return;
    }
    ok("signatureTimeStamp attribute present (RFC 3161)");
    try {
      ASN1Set values = tsAttr.getAttrValues();
      if (values.size() < 1) { flag("signatureTimeStamp attribute has no token"); return; }
      byte[] tokenBytes = values.getObjectAt(0).toASN1Primitive().getEncoded();
      ok("timestamp token extracted (" + tokenBytes.length + " bytes)");

      // the token is a CMS SignedData whose eContent is the DER TSTInfo
      CMSSignedData token = new CMSSignedData(tokenBytes);
      ok("timestamp token parses as a CMS SignedData");
      CMSProcessable content = token.getSignedContent();
      if (content == null) { flag("timestamp token has no TSTInfo eContent"); return; }
      byte[] tstInfoBytes = (byte[]) ((CMSProcessableByteArray) content).getContent();
      ASN1Sequence tst = ASN1Sequence.getInstance(tstInfoBytes);
      ASN1Sequence imprintSeq = ASN1Sequence.getInstance(tst.getObjectAt(2));
      ASN1OctetString hashed = ASN1OctetString.getInstance(imprintSeq.getObjectAt(imprintSeq.size() - 1));
      ASN1GeneralizedTime genTime = ASN1GeneralizedTime.getInstance(tst.getObjectAt(4));
      ASN1Integer tokenSerial = ASN1Integer.getInstance(tst.getObjectAt(3));
      System.out.println("  · TSA genTime = " + genTime.getDate().toInstant() + "  token serial = " + tokenSerial);

      // the TSA signature must verify against the TSA cert inside the token
      Store tsaStore = token.getCertificates();
      java.util.Collection<SignerInformation> tsaSigners = token.getSignerInfos().getSigners();
      if (tsaSigners.isEmpty()) { flag("timestamp token has no signer"); return; }
      for (SignerInformation tsi : tsaSigners) {
        java.util.Collection<?> tsaCerts = tsaStore.getMatches(tsi.getSID());
        if (tsaCerts.isEmpty()) { flag("TSA certificate not found in the token"); continue; }
        X509CertificateHolder tsaCert = (X509CertificateHolder) tsaCerts.iterator().next();
        ok("TSA certificate found in the token (" + tsaCert.getSubject() + ")");
        Date now = new Date();
        if (now.before(tsaCert.getNotBefore()) || now.after(tsaCert.getNotAfter())) {
          flag("TSA certificate is NOT currently valid");
        } else {
          ok("TSA certificate is currently valid");
        }
        SignerInformationVerifier tsaVerifier =
          new JcaSimpleSignerInfoVerifierBuilder().setProvider("BC").build(tsaCert);
        if (tsi.verify(tsaVerifier)) ok("timestamp token signature verifies (TSA)");
        else flag("timestamp token signature DOES NOT verify");
      }

      // PAdES: imprint = SHA-256 over the signed attributes MINUS the
      // timestamp attribute (DER-encoded, re-sorted — byte-identical to the
      // SET Volt hashed when the attrs are already in DER order)
      ASN1EncodableVector sansTs = new ASN1EncodableVector();
      for (Enumeration e = table.toHashtable().elements(); e.hasMoreElements();) {
        Attribute a = (Attribute) e.nextElement();
        if (!a.getAttrType().equals(tsOid)) sansTs.add(a);
      }
      byte[] attrsDer = new DERSet(sansTs).getEncoded();
      byte[] imprint = MessageDigest.getInstance("SHA-256").digest(attrsDer);
      if (Arrays.equals(imprint, hashed.getOctets())) {
        ok("timestamp messageImprint matches SHA-256(signed attrs minus timestamp attr)");
      } else {
        flag("timestamp messageImprint does NOT match the signed attributes");
      }
    } catch (Throwable e) {
      flag("timestamp verification threw: " + e);
    }
  }

  public static void main(String[] args) throws Exception {
    if (args.length < 1) {
      System.out.println("usage: java ValidateSignature <signed.pdf>");
      System.exit(2);
    }
    Security.addProvider(new BouncyCastleProvider());
    File file = new File(args[0]);
    byte[] fileBytes = Files.readAllBytes(file.toPath());
    System.out.println("Validating " + file.getName() + " (" + fileBytes.length + " bytes)");

    // ── 1. PDFBox load — strict xref/object parsing ──
    PDDocument doc;
    try {
      doc = Loader.loadPDF(file);
      ok("PDFBox loads the document (xref + objects parse cleanly)");
    } catch (Throwable e) {
      flag("PDFBox cannot load the document: " + e);
      System.exit(1);
      return;
    }

    // ── 2. Signature dictionary ──
    java.util.List<PDSignature> sigs = doc.getSignatureDictionaries();
    if (sigs.isEmpty()) {
      flag("no signature dictionaries found");
      System.exit(1);
      return;
    }
    ok("found " + sigs.size() + " signature dictionary" + (sigs.size() == 1 ? "" : "s"));
    PDSignature sig = sigs.get(0);
    String filter = sig.getFilter();
    String subFilter = sig.getSubFilter();
    if (filter == null || !"Adobe.PPKLite".equals(filter)) flag("Filter is not Adobe.PPKLite (" + filter + ")");
    else ok("Filter=Adobe.PPKLite");
    if (subFilter == null || !"adbe.pkcs7.detached".equals(subFilter)) flag("SubFilter is not adbe.pkcs7.detached (" + subFilter + ")");
    else ok("SubFilter=adbe.pkcs7.detached");

    int[] br = sig.getByteRange();
    if (br == null || br.length != 4) {
      flag("ByteRange missing or malformed: " + (br == null ? "null" : java.util.Arrays.toString(br)));
      System.exit(1);
      return;
    }
    ok("ByteRange = " + java.util.Arrays.toString(br));
    if (br[0] != 0) flag("ByteRange[0] must be 0, got " + br[0]);
    long coveredEnd = (long) br[2] + br[3];
    if (coveredEnd != fileBytes.length) {
      flag("ByteRange second range does not reach EOF: " + coveredEnd + " != " + fileBytes.length
        + " (file modified after signing, or broken range)");
    } else {
      ok("ByteRange covers the whole file except the signature value");
    }
    long gap = (long) br[2] - (br[0] + br[1]);
    ok("excluded /Contents span = " + gap + " bytes");
    // the excluded span must be the whole `<hex>` value, delimiters included
    if (br[1] + br[0] >= 0 && br[2] > br[1] && fileBytes[br[0] + br[1]] == (byte) '<' && fileBytes[br[2] - 1] == (byte) '>') {
      ok("excluded span is the whole <hex> value (delimiters included)");
    } else {
      flag("excluded span does not start with '<' and end with '>' (PDFBox's /Contents extraction expects that)");
    }
    java.util.Calendar signDate = sig.getSignDate();
    System.out.println("  · M (signing time) = " + (signDate == null ? "null" : signDate.getTime().toInstant().toString()));

    // ── 3. CMS verification via BouncyCastle ──
    boolean cmsOk = false;
    try {
      byte[] cmsBytes = sig.getContents(fileBytes);
      ok("extracted CMS (" + cmsBytes.length + " bytes)");
      byte[] covered = new byte[br[1] + br[3]];
      System.arraycopy(fileBytes, br[0], covered, 0, br[1]);
      System.arraycopy(fileBytes, br[2], covered, br[1], br[3]);

      CMSSignedData signedData = new CMSSignedData(new CMSProcessableByteArray(covered), cmsBytes);
      ok("BouncyCastle parses the CMS SignedData structure");

      Collection<SignerInformation> signers = signedData.getSignerInfos().getSigners();
      if (signers.isEmpty()) {
        flag("no signer infos in the CMS");
      } else {
        for (SignerInformation si : signers) {
          System.out.println("  · digestAlg = " + si.getDigestAlgOID() + "  encAlg = " + si.getEncryptionAlgOID());
          if (si.getSignedAttributes() == null || si.getSignedAttributes().size() == 0) {
            flag("no signed attributes (messageDigest/contentType/signingTime required)");
          } else {
            ok("signed attributes present (" + si.getSignedAttributes().size() + ")");
          }
          Store certStore = signedData.getCertificates();
          Collection<?> certs = certStore.getMatches(si.getSID());
          if (certs.isEmpty()) {
            flag("signer certificate not found in the CMS cert set (issuer+serial mismatch)");
            continue;
          }
          X509CertificateHolder certHolder = (X509CertificateHolder) certs.iterator().next();
          ok("signer certificate found in the CMS (issuer+serial match)");
          System.out.println("  · subject = " + certHolder.getSubject());
          Date now = new Date();
          if (now.before(certHolder.getNotBefore()) || now.after(certHolder.getNotAfter())) {
            flag("signer certificate is NOT currently valid ("
              + certHolder.getNotBefore() + " .. " + certHolder.getNotAfter() + ")");
          } else {
            ok("signer certificate is currently valid");
          }
          SignerInformationVerifier verifier =
            new JcaSimpleSignerInfoVerifierBuilder().setProvider("BC").build(certHolder);
          boolean valid = si.verify(verifier);
          if (valid) ok("RSA signature over the signed attributes verifies");
          else flag("RSA signature over the signed attributes DOES NOT verify");

          // ── RFC 3161 timestamp (PAdES signatureTimeStamp attribute) ──
          verifyTimestamp(si);
        }
      }
      cmsOk = true;
    } catch (CMSException e) {
      flag("BouncyCastle rejected the CMS: " + e.getMessage());
    } catch (Throwable e) {
      flag("CMS verification threw: " + e);
    }
    doc.close();
    System.out.println();
    if (issues > 0) {
      System.out.println("RESULT: " + issues + " issue(s) flagged");
      System.exit(1);
    } else if (cmsOk) {
      System.out.println("RESULT: clean — signature verifies under PDFBox + BouncyCastle");
      System.exit(0);
    } else {
      System.out.println("RESULT: incomplete (CMS could not be verified)");
      System.exit(1);
    }
  }
}
