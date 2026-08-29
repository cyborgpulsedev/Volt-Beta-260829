# Volt changelog

Each release is a `## x.y.z` section. The version banner tooltip shows the
sections newer than the installed bundle, so a pending update tells you what
changed before you restart.

## 1.0.6

The two commits that landed after 1.0.5 was cut, published so the installer
matches `main`.

- **Saved files keep their size**: `buildEditedPdf` called `copyPages` once
  PER PAGE, and pdf-lib only deduplicates shared indirect objects — fonts,
  images, XObjects — within a single call, so every shared resource was
  re-copied for each page. Reordering two pages of a 4.7 MB / 207-page
  document produced 24.4 MB; batching each source into one call gives 4.77 MB
  (0.96x the original) and 0.67 s instead of ~2.3 s.
- **A plain save no longer rewrites the file larger**: `toAnnotatedPdf` forced
  classic xref output on EVERY save for the benefit of the optional lock/sign
  paths, costing ~12% on modern PDFs. It matches the source document's own
  encoding now; Secure, Sign and PDF/A pass `{ classic: true }`, which they
  genuinely require.
- **Escape reaches the top layer**: `_modals()` named 8 of the document's 15
  modals, so Secure, Sign, Setup, Feedback, Signature, Form field and the
  `file://` notice had no focus trap, no inert background, no
  one-modal-at-a-time guard and no Escape — Escape fell through to the
  annotation-mode reset. The list is read from the DOM now, so a new modal
  cannot be forgotten; backdrop-click close follows the same list.
- **Document actions are user-toggleable**: a checkbox in Settings and a
  toggle in the chat footer write one setting, both carrying the same warning
  that a local model may ignore an action or claim one it never took.
- **Models without tool support are marked**: per-model capabilities come from
  Ollama's `/api/show` and appear in the picker and the toggle's tooltip.
  `gemma3:1b` and `dolphin3:8b` report no tool support yet were offered
  without a word.
- **Tool plumbing a model prints instead of calling is stripped**: a reply that
  is one call-shaped JSON object whose name is NOT a tool is the model wrapping
  its answer in an envelope, so it is unwrapped and shown; a schema dump line
  is dropped; a real tool name in that shape gets a plain explanation. JSON
  inside ordinary prose is untouched.
- **The uninstall entry carries `InstallLocation`**: electron-builder writes
  DisplayName, DisplayVersion, Publisher and the uninstall strings but not the
  path, so Volt appeared in Programs and Features with no install location.
- **Icons regenerated from the brand master**: `volt.ico` and the two installer
  icons were stale against it, so 1.0.5 still installed the placeholder.
- **The beta repo publishes its own README**: `docs/README.beta.md`, swapped in
  by `scripts/sync-beta.cjs`. The private README is written for someone with
  the source and linked to a repo testers cannot open.
- **Tests**: the smoke gate is green again — the probes for the chat's
  deliberately removed "Clear highlights" / "Copy highlights" quick actions are
  retired, and the bootstrap assertion asks `AI._bootstrapModel()` which tier
  the app picked instead of hard-coding a model sized for an 8 GB box.

## 1.0.5

Fixes from a full beta acceptance pass over 1.0.4.

- **Exports save under their real names**: every export reached the OS as a
  blob download with no `will-download` handler behind it, so Electron parked
  it in a `<guid>.tmp` under Downloads and never renamed it. Word, Excel,
  PowerPoint, PDF/A, annotated PDF, Markdown and backup all arrive as
  `Name.ext` now, numbered rather than overwritten when the name is taken.
- **Word opens the .docx**: embedded pictures wrote the relationship id
  ("rIdImg1") into `wp:docPr/@id` and `pic:cNvPr/@id`, which OOXML defines as
  an unsigned integer — so any PDF with an image produced a file Word and
  LibreOffice both refused. Text-only exports were unaffected, which made it
  look intermittent.
- **PowerPoint opens the .pptx**: the table style in `theme1.xml` wrote the
  cell margins as an element name (`<a:marL="45720"…>`) instead of attributes
  on `a:tcTxPr`, so *every* exported deck was invalid XML.
- **Office exports survive symbolic fonts**: pdf.js returns raw glyph codes
  for fonts with a custom encoding, and those control characters went straight
  into `document.xml`. XML 1.0 allows none of them, so one such page made the
  whole package unparseable. `OE.xml` — the single escaper every docx/xlsx/pptx
  string passes through — now strips them along with unpaired surrogates.
- **Sidebar thumbnails follow the open document**: `_pageThumbCache` is keyed
  by page number with no document identity and was only cleared when the Pages
  manager opened, so a second document blitted the first one's page images
  while navigating by number.
- **A straight drag across a line marks it up**: a drag counted as a click when
  *either* axis was under 3px, and line membership needs the drag band to
  contain a line's vertical centre — which a zero-height band never does. Both
  now handle the flat drag; angled drags and multi-line precision are unchanged.
- **The AI reads the page you name**: an explicit "page 1" / "p.12" /
  "pages 3-4" in the question is an instruction, but relevance scoring treated
  it as an ordinary token and routinely retrieved other pages entirely. Named
  pages are now pinned ahead of the ranked ones.
- **The page readout populates on open**: it is derived from the page layout,
  and nothing refreshed it once that layout first existed, so every document
  showed "—" until the user happened to scroll.
- **Release notes track the release**: `release-notes.md` still carried the
  1.0.1 text, so the update feed showed 1.0.1's changelog to 1.0.4 installs.
- **Download links reach a repo testers can open**: the README and landing
  page pointed at the private repository.
- **Tests**: `test:office` now asserts every generated XML part is well-formed,
  free of control characters, has no attribute written as an element name, and
  uses numeric drawing ids — the two export blockers above passed all previous
  structural checks.

## 1.0.4

- **Jagged bolt logo**: the toolbar V+bolt SVG now has a 9-point zigzag
  stroke with square linecaps and miter joins — sharper, more electric.
- **Neon glow pulse**: the brand mark breathes with a subtle 3-second
  cyan→violet glow animation (disabled in Quiet mode).
- **Paper skin restored**: a light background skin with neon accents sits
  alongside Neon and Quiet in View ▸.

## 1.0.3

- **Cypul Neon rebrand**: the app chrome now uses the cyan/violet/magenta
  Neon palette (`#2FE6FF` / `#A855F7` / `#FF3BC8`), Jost body text, and a
  new **Neon / Paper / Quiet** skin picker in View ▸ (Neon keeps the full
  glow; Paper switches to a light background with neon accents for
  daylight; Quiet desaturates the accents and dials the glow down).
- **Library 3 AM logo**: the VOLT wordmark is now rendered in the one-line
  neon display face (bundled locally, FFC license) with a neon glow — both
  in the toolbar and in the Windows shortcut / PWA icons.
- **Settings model picker**: the Ollama model field now populates from the
  native `/api/tags` endpoint (every pulled model), with a `/v1/models`
  fallback for older Ollama installs.

## 1.0.2

- **E-signatures pass stricter external validators**: the signed PDF is
  now checked end-to-end by a real external stack — `npm run test:pdfbox`
  signs a probe and verifies the `/Sig` field + CMS through Apache PDFBox
  3 + BouncyCastle (hermetic in CI with an ephemeral openssl cert). That
  gate exposed four real bugs, all fixed: the `/ByteRange` fourth element
  was an end offset instead of the second range's length (a range running
  past EOF is malformed), `/M` and `/Reason` were serialized as PDF names
  instead of strings, the SignerInfo issuer+serial was silently zeroed
  (typed arrays passed into the ASN.1 builder), and the signed-attributes
  SET was not in DER order (BouncyCastle re-encodes and re-sorts, so the
  RSA check failed). The excluded region now spans the whole `<hex>`
  value — delimiters included — matching Acrobat's own convention.
  OpenSSL-3 PFX exports are supported too: the MAC check reads the digest
  OID (HMAC-SHA-256) and PBES2 decrypts with the correct PRF and the
  raw-password bytes, so a modern `openssl pkcs12` export works.
- **RFC 3161 timestamping**: the sign dialog gained a TSA URL field
  (remembered per user). Volt.Sign builds the TimeStampReq, POSTs it to
  the authority over HTTP(S), parses the TimeStampResp, and embeds the
  token as a PAdES `signatureTimeStamp` signed attribute whose
  messageImprint is the hash of the signed attributes minus the timestamp
  attribute — so a verifier accepts the signature as made at the token's
  genTime and it **stays valid after the certificate expires**. The PDFBox
  gate now signs through a local `openssl ts -reply` TSA (hermetic — no
  external network in CI) and verifies the token: it parses, the TSA
  signature checks against the TSA cert inside it, and the messageImprint
  matches.
- **Feedback is never lost offline**: Send feedback… now probes
  github.com (fast path when the machine reports offline) and, if the
  issue page can't open — offline, unreachable, or the external-browser
  open fails — saves the drafted report as a timestamped
  `volt-feedback-YYYYMMDD-HHMMSS.md` file (Downloads) that keeps the
  prefilled GitHub URL so it can be submitted later. Only a hash reaches
  the probe; nothing is transmitted.
- **Secure PDF exports open again**: a locked file no longer rejects its
  own password. The password pad was corrupting the U/O values Volt wrote
  (the pad overwrote the password bytes, appended the wrong end of the pad
  string, and used UTF-8 where pdf.js reads low bytes; the owner-key hash
  was also untruncated) — every one of those is fixed, and the annotated
  export is now saved in classic form (no object streams) so the lock
  byte-walker can rebuild the file it encrypts. Verified end-to-end by a
  new gate (`npm run test:lock`) that locks real output and opens it in the
  vendored pdf.js with the user **and** owner passwords — ASCII, accented
  and CJK passwords, multi-page documents, wrong/empty rejection, and a
  loud failure if an unsupported object-stream PDF ever reaches the lock
  again.
- Bookmarks travel with your work: the **JSON backup** now carries them
  (backup version 6), so a restore lands your jump marks in the document
  they belong to (or the one you import into — pages are clamped to the
  target's page count), and the **Markdown notes export** includes a
  **Bookmarks** section with each page and label. The post-restore summary
  card reports how many bookmarks landed; a backup without a bookmarks
  layer (older files) leaves your bookmarks untouched.
- Bookmarks live in the Outline too: a **Bookmarked pages** section is
  pinned to the top of the sidebar's **Outline** tree (sorted by page,
  always above the document's own outline). It updates live as bookmarks
  come and go, and one click jumps to the page — bookmarks are reachable
  from the same navigation surface as the document's headings.
- Bookmarks without the panel: **Markup ▸ Bookmark this page** drops a jump
  mark on the page you're reading, and **right-clicking a sidebar page
  thumbnail** bookmarks that page (or removes its bookmarks) from a small
  context menu — both update the badge and the list instantly.
- Page modes: **View ▾** picks how you read — **Continuous scroll** (pages
  flow in one column, scroll freely), **One page** (scrolling rests on page
  boundaries — one page per scroll), or **Two pages** (a book spread: pages
  sit side by side in pairs, 1–2, 3–4, …, with fit-width/fit-page zoom
  recalculated for the pair). The choice is remembered per user and comes
  back on the next open — and **Ctrl+1 / Ctrl+2 / Ctrl+3** switch One page /
  Two pages / Continuous from the keyboard (also shown in the View menu
  tooltips and the in-app Shortcuts reference). In Two pages, each spread
  carries a **pair label** ("1–2", "3–4", …) centered under the whole row
  instead of a number under each page (a lone trailing page labels itself),
  and the sidebar's Pages tab **highlights both pages of the visible spread**
  together instead of a single page.
- Flip like a book: in **Two pages**, ← / →, PageUp/PageDown and clicks in
  the left/right margin turn the spread with a page-turn animation — the
  pair rotates away on the spine axis and the next one lands in.
- Opening Volt no longer greets you with a popup to dismiss. On a fresh
  profile a small pill appears in the blank toolbar area — **← Click here
  to get started or for help** — fades in, holds, then slides away behind
  the **Volt ▾** menu on its own (nothing to dismiss, reading is never
  blocked). With **prefers-reduced-motion** enabled the hint fades in and
  out instead of sliding. Clicking it opens **Help & guides**; engaging
  with it stops it from replaying, and the Setup wizard stays under
  **Volt ▾ → Setup wizard…**.
- Feedback: **Volt ▾ → Send feedback…** drafts a GitHub issue on the public
  repository with your message plus an attached environment block (version,
  engine, OS, open document), opening in the default browser for review
  before submitting — the app never transmits anything itself.
- E-sign: **Export ▸ Digitally sign PDF…** attaches a real certificate
  signature to the annotated export — an AcroForm `/Sig` field with a
  `/ByteRange` and a detached PKCS#7 (CMS) SignedData that Acrobat and
  pdf.js validate. The certificate comes from a local PKCS#12
  (`.pfx`/`.p12`) file picked via the native dialog (or a file input in
  the PWA); the whole chain runs in-process on Web Crypto — PKCS#12
  parsing with the MAC verified (PBES1-3DES + PBES2-AES, with a pure-JS
  TripleDES implementation checked against Node's crypto), CMS build,
  and the byte surgery that patches the ByteRange + xref in place. The
  smoke's `signProbe` signs with the dev certificate and re-verifies the
  signature cryptographically in the renderer.
- ISO PDF standards: **Export ▸ PDF/A-1b (ISO 19005-1)** produces an
  archival-standard PDF — XMP metadata with the pdfaid part/conformance
  pair, a /Metadata stream (uncompressed, as the standard demands), an
  OutputIntent with an embedded sRGB ICC v2 profile, document info, a
  trailer file identifier, embedded fonts and a classic xref. Built on
  pure, unit-tested helpers (`buildSrgbIcc`, `pdfA1bXmp`,
  `injectPdfTrailerId`), verified by the smoke's `isoProbe` (the required
  elements are asserted in the exported bytes and the file re-opens
  through pdf.js with its text intact). Semi-transparent annotation
  overlays are the one thing a strict validator may flag — see the README
- Bookmarks: mark any page to jump back to, with a per-document list in the
  sidebar — add from the toolbar or `Ctrl+Shift+B`, rename labels inline,
  remove one or clear all, and find them live by label or page number; a
  small ribbon marks bookmarked pages, and bookmarks renumber when pages
  are deleted or reordered

## 1.0.1

- Security & stability: upgraded the Electron runtime (33 → 43, a 10-major
  jump covering 16 high-severity advisories) and the build toolchain
  (electron-builder 26) — `npm audit` is now clean at 0 vulnerabilities
- Release hardening: releases are only cut from the current tip of `main`
  with fresh generated assets, so updates always ship the latest fixes
- Smoother window-resize handling in the packaged smoke tests

## 1.0.0

- OCR-first text layer: scans whose invisible embedded text sits offset from
  the visible page can switch to Volt's own OCR text (highlights, selection,
  search and the AI then follow the visible text)
- Version-ready banner with a 15s auto-restart countdown, Cancel, and a
  "never auto-restart" setting — plus automatic relaunch when the desktop
  shortcut is clicked while a stale instance is running
- What's-new tooltips: the banner now shows this changelog for the pending
  version
- Per-document AI overrides (model, context, system prompt) with one-click
  persona presets (Legal, Beginner, Concise) and custom personas
- Global model + temperature controls right in the AI panel header
- Restore backup with content fingerprints (renamed copies still match),
  restore-by-URL, and a post-restore summary card
- Pages manager: add/delete/reorder/insert, drag-and-drop reordering with
  undo/redo, keyboard range selection, and a move-to-position form
- Area highlights: rotate, duplicate (Ctrl+D), nudge with arrow keys, and a
  live size readout while dragging
- Built-in local LLM bootstrap (one-click Ollama install + qwen3 pull) and a
  private app-owned Ollama instance with origins locked to Volt
- Read-aloud with local voices, external TTS/STT endpoints, and voice chat
  with the AI
- Rectangle tool with click-to-place and configurable default size

## 0.9.0

- Toolbar dropdown menus (File / View / Tools) with full keyboard support
- OCR with on-demand language downloads and a searchable language picker
- Ctrl+A / Ctrl+A+A whole-document selection, "Highlight all", per-page
  highlight breakdowns and copy-with-citations
- Focus trap for every modal, with real-keyboard Tab/Shift+Tab smoke coverage
- Stale-bundle detection: served sw.js cache name vs installed caches

## 0.8.0

- First release: fast local PDF reader with highlights, underlines, notes and
  area highlights; AI chat grounded in the document with page citations;
  PWA install; desktop Electron packaging with file association
