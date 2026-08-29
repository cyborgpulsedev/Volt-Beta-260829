## Volt 1.0.2

E-signatures, secure exports, bookmarks, page modes, and service-worker hardening.

### E-signatures verified end-to-end
The signed PDF is checked by Apache PDFBox 3 + BouncyCastle. Fixed four bugs: ByteRange length, /M and /Reason as PDF names, zeroed signer-id, signed-attributes SET order. OpenSSL-3 PFX exports supported.

### RFC 3161 timestamping
Sign dialog gains a TSA URL field. Token embedded as PAdES signatureTimeStamp — signature stays valid after cert expiry.

### Secure exports that reopen
Locked PDFs open with both user and owner passwords. Classic-form exports for the lock byte-walker.

### Bookmarks everywhere
JSON backup (version 6), Markdown export, pinned above document outline. Bookmark from menu, toolbar, or thumbnail.

### Page modes
Continuous / One page / Two pages — Ctrl+1/2/3. Book-flip animation, pair labels, sidebar spread highlighting.

### Service worker hardened
Network-first for navigations, cache-first for hashed assets. No more stale shell.

### Tools menu polish
Shows hint when no document loaded (was empty before).

---

**Install:** `Volt-Setup-1.0.2.exe` — per-user, no admin needed. Windows 10+ 64-bit.
**Update:** Existing installs update automatically.
