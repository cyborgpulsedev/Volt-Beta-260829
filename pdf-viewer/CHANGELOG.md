# Volt changelog

Each release is a `## x.y.z` section. The version banner tooltip shows the
sections newer than the installed bundle, so a pending update tells you what
changed before you restart.

## 1.0.14

**Markup is now real PDF annotations, and flattening is its own export.**

Highlights, underlines, strikethroughs, boxes and notes used to be painted
into the page's content stream. That prints correctly and is impossible to
undo: in Acrobat the highlight was part of the page rather than something you
could click, recolour, reply to or delete, and no other tool could read the
markup back out.

- **Export > Annotated PDF writes real objects** — `/Highlight`, `/Underline`,
  `/StrikeOut`, `/Square` and `/Text`, with `/QuadPoints`, colour, author,
  timestamp and contents. Verified against a real export: five annotations,
  one of each type, all present in the file.
- **Export > Flatten for printing** keeps the old behaviour on purpose, for a
  file going to a printer or to someone who must not be able to move the
  markup. It writes zero annotation objects.
- **Every markup annotation carries its own appearance stream.** Acrobat will
  synthesise one, but pdf.js, Chrome's viewer, Preview and most phone readers
  will not — a `/Highlight` without `/AP` is simply invisible to most of the
  people it was written for. Confirmed by reopening the exported file in
  Volt with its own markup layer empty: all four visible types render from
  the file itself.
- **Highlights use a Multiply blend**, so the text underneath stays legible
  rather than being washed out by a flat overlay.
- **The print flag is set** on every annotation. Without it a viewer may show
  markup on screen and silently omit it from paper, which is not what anyone
  means by highlighting something.
- **Some marks stay flattened, by necessity.** A redaction must destroy what
  is under it, which is content surgery rather than an overlay; signatures,
  dates, filled form values and in-place text edits become the document once
  applied. A rotated box keeps being burned in too, because `/Square` is
  axis-aligned by definition and would silently lose its rotation.
- **PDF/A-1b still flattens.** The standard forbids transparency and blend
  modes, and a highlight's appearance uses both.
- **Tests**: a smoke probe exports one of every type and checks the count, the
  subtypes, that every markup annotation has an appearance, that the print
  flag is set, and that flattening writes none. It also pins `/QuadPoints`
  ORDER — upper-left, upper-right, LOWER-LEFT, lower-right, which is not a
  loop around the shape. Getting that wrong renders a highlight as a bow-tie
  or not at all, and no structural check would notice.

## 1.0.13

**A two-column article is no longer exported as a two-column table.** Last gap
in the Word layout work.

- **Two-column prose is told apart from tabular data.** The gap-based detector
  finds a table wherever text sits in aligned columns with a real gap between
  them — precisely the shape of a two-column page of prose. It claimed those
  pages before the column ordering added in 1.0.12 could see them, so an
  article came out as a table with a sentence in every cell. A candidate is
  now rejected as prose only when it has exactly two columns, at least six
  rows, a median cell of 25 characters or more in BOTH columns, and most cells
  carrying several spaces.
- **Real tables are untouched.** A long two-column table of short values is
  still a table, and one long description column beside a short value column
  is still a table — that pair is what the guard must not swallow, and both
  are pinned by tests. Tables drawn with ruling lines are never
  second-guessed; they carry evidence of their own.
- **Measured on a real two-column PDF**: 60 paragraphs and 0 tables, where
  before it was 0 paragraphs and 1 table. Left column read out in full, then
  the right, with no line mixing the two.
- **Ruling-line tables verified rather than rebuilt.** A 5x7 inspection form
  with eight deliberately empty cells — the case gap detection cannot see at
  all — already reconstructed as a 7x5 grid with every value in the right cell
  and the blanks preserved. Last item on the layout list, closed without new
  code.
- **Positioned text frames dropped from the plan.** They were the intended way
  to hold page count, and measuring showed page geometry plus exact leading
  already achieve it at a fraction of the complexity. Worth revisiting only
  for a document where reading order and flow are not enough.

## 1.0.12

**Word export: columns read in order, and the type looks like the document's.**
Second slice of the layout work, plus the gate that measures it.

- **Two-column pages are read column by column.** Lines were grouped by their
  Y position across the full page width, which is right for one column and
  wrong for two: a line on the left and the line beside it on the right share
  a Y, so they were joined into one and the export read as both columns
  interleaved, sentence by sentence. A gutter is now found by looking for a
  vertical band no token crosses — wide enough not to be a word space, inside
  the text rather than at its edge, and with real text on both sides so a
  page number or a marginal note cannot become a column. Verified on a real
  two-column PDF: 60 lines, left column first in order, right column after,
  zero lines mixing the two. A single-column page is returned untouched and
  pays nothing.
- **Type is matched to the document's.** Every line came out in Word's default
  sans-serif, so a serif document changed character and — because the metrics
  differ — changed length. The PDF font's own name carries its family and
  weight; it is mapped onto Times New Roman, Arial or Courier New, with bold
  and italic read from the same name. Resolved through `commonObjs.has()`
  before `get()`, because `get()` throws on an unresolved id and one unloaded
  font must not cost a page its faces.

**New gate: `npm run test:docx-fidelity`.** LibreOffice renders the exported
`.docx` and counts the pages a reader would actually see. Every other office
test asserts structure, and none of them could see the failure that mattered
most: a dense A4 report reflowed onto Letter came out at twice its page count
from a perfectly valid file. The overflow that caused it was four twips a page
— 0.2pt — which only a renderer can settle. Proven to fail: reintroducing the
old fixed-Letter section turns 12 pages into 24 and the gate red. Soft-skips
when LibreOffice is absent, and CI installs it.

Still to come: tables rebuilt from ruling lines. Also found while testing —
a two-column prose page is currently classified as a table by the gap
detector, so it exports as a two-column table rather than flowing text. That
is the next thing to fix.

## 1.0.11

**Word export: a page holds what it held.** First slice of the layout work.

The export reflowed every document onto US Letter at Word's default 11pt with
one-inch margins, whatever the source actually was. On a dense A4 report set in
8pt that came out at exactly twice the page count — 60 pages became 120 — and
the same shape of failure is what turned a 207-page document into 471.

Measured with LibreOffice rather than guessed at: each source page declared
15,244 twips of content into 15,240 twips of usable height. **Four twips over**,
so every single page spilled one line onto a second page. Three changes close
it, and the same 60-page document now exports to 61 pages.

- **The section takes the document's own page size**, including landscape, so
  A4 stays A4. A mixed-size document uses the size most of its pages share,
  because a Word section carries exactly one.
- **Margins come from where the text actually sits**, with three points of
  slack — the measured extents are where glyphs are, and a renderer wants
  slightly more than that. The shortfall was tiny and total.
- **Every line carries the point size and leading it was set in**,
  `lineRule="exact"` so Word adds none of its own. An 8pt line no longer
  occupies 11pt of height. A line at the foot of a page, which has no next
  line to measure against, uses its own size rather than falling back to
  Word's default paragraph height — which was taller than the line it
  replaced, and on a full page that alone was enough to spill it.
- **The "Page N" label is gone** from the Word export. The source page never
  had one, and adding anything to a page whose text already fills it costs a
  whole extra page. Plain-text export still rules its pages, because there a
  reader has nothing else to go on.

Still to come in this milestone: column detection, table reconstruction from
ruling lines, and font matching. Line-level geometry — size, leading, left
edge — is now carried through the collectors, which is what those need.

- **Tests**: seven assertions pin the page size, the derived margins, per-line
  sizing, exact leading, the absence of the label, landscape marking, and —
  the one that actually decides it — that a full source page's declared line
  heights sum to less than the usable page height.

## 1.0.10

**Text-only exports: Word, plain text and CSV.**

The Word and PowerPoint exports run table detection, grid analysis and image
extraction over every page. That is where their cost and their failure modes
live: a document whose ruling lines confuse the grid pass comes out with prose
absorbed into a table, and a large scanned file spends minutes pulling out
pictures nobody wanted. These three promise less and always deliver it — the
words, in reading order, page by page, with no guess at structure.

- **Word document — text only (.docx)**: paragraphs and nothing else. No
  tables, no pictures, no layout reconstruction. Reliable on any PDF, and the
  one to reach for when the full export gets a document wrong.
- **Plain text (.txt)**: the document's text with a `--- Page N ---` rule
  between pages. CRLF line endings, because these land on Windows and open in
  Notepad often enough that a run-on single line is a real complaint.
- **Tables as CSV (.csv)**: detected tables in one plain file that opens
  anywhere without a spreadsheet. RFC 4180 quoting, so a cell containing a
  comma, a quote or a newline round-trips. Written with a UTF-8 BOM, without
  which Excel reads the file as the local ANSI codepage and turns every
  accented character into mojibake. Several tables are separated by a
  `# Table N (page P)` comment; a single table is plain CSV with no preamble.

All three honour a live Pages-manager selection, exactly like the existing
Office exports, and all three offer **Open with…** from the toast — which is
why `.txt` and `.csv` joined the desktop bridge's extension allowlist.

- **Tests**: 19 assertions covering line survival and ordering, page marking,
  CRLF, CSV quoting of every awkward cell, the multi-table labelling, and that
  the text-only .docx contains no `<w:tbl>` and no `<w:drawing>` at all — a
  regression there would most likely be the text-only path quietly acquiring
  the table detection it exists to avoid. The smoke gate exercises all three
  against a real document and asserts every collected line reaches the file.

## 1.0.9

**Beta builds are published unsigned, so automatic updates actually install.**

Every release since the beta began downloaded itself in the background and was
then silently thrown away. electron-updater verifies a downloaded installer
against the publisher name recorded in `app-update.yml`, and it requires
Windows to report the signature as **Valid** — a self-signed certificate always
reports `UnknownError`, because its root is not trusted. The publisher name
matched perfectly and the check failed anyway, with no symptom in the UI: the
log line `New version 1.0.x is not signed by the application owner` was the only
trace. `VOLT_ALLOW_UNSIGNED=1` had never actually built unsigned either — it
skipped the certificate GUARD while electron-builder went on signing from
`CSC_LINK`, which is how the broken posture survived.

Unsigned means no `publisherName` in `app-update.yml`, so the updater installs
what it downloads. SmartScreen warns on first launch either way, and a
self-signed identity that anyone can forge was never a real control. The day a
commercial certificate lands, drop the flag and verification becomes meaningful
rather than merely present.

- `VOLT_ALLOW_UNSIGNED=1` now clears `CSC_LINK`, `CSC_KEY_PASSWORD` and
  `CSC_IDENTITY_AUTO_DISCOVERY` before building, instead of only skipping the
  guard.
- The release refuses to finish if the build it just published still carries a
  `publisherName` — a certificate sneaking back in would re-break updates with
  nothing to see.

**Existing installs must be updated by hand this once.** The rejection happens
inside the copy of Volt you already have, so 1.0.8 and earlier will refuse
1.0.9 exactly as they refused everything before it. Download and run the
installer once; from then on updates arrive on their own.

## 1.0.8

- **"Check for updates" reported an error every time**, including when a newer
  release really was sitting on the feed. The handler branched on
  `result.status`, a field electron-updater's `UpdateCheckResult` has never
  had, so every check fell through to `unexpected updater status: ` with an
  empty status. It reads `isUpdateAvailable` now. Automatic updates were
  unaffected — they run off the update-available / update-downloaded events —
  which is why nothing noticed until someone pressed the menu item.
- **The release script reconciles what it published.** electron-builder uploads
  a release's assets concurrently and each uploader decides for itself whether
  the release needs creating; they race, one wins, the rest 422, and the run
  exits having uploaded only some of the files. Twice that shipped a release
  with the installer but no `latest.yml` — a download page that works and an
  update feed that 404s, the worse half to lose because nothing looks wrong
  from outside. `scripts/finish-release.cjs` now rebuilds the feed from the
  artifact on disk, uploads whatever is missing, sets the notes, and fails
  loudly unless the feed's size and SHA-512 match the installer that is
  actually attached. `npm run release` calls it and treats a reconciled
  release as a success.
- **Tests**: `test:utils` asserts the updater contract directly — that
  `UpdateCheckResult` exposes `isUpdateAvailable` and has no `status` field,
  and that the handler reads the former — so reading a field that does not
  exist cannot come back, and a future electron-updater changing the shape
  fails the gate rather than the feature.

## 1.0.7

Everything a full beta pass over 1.0.6 turned up, plus somewhere to put your
files.

- **Any page more than four away from the current one rendered nothing.**
  `_updatePagePosition` placed each page by the gap from the previous page
  NUMBER, but virtualisation disposes the pages you scroll past, so that
  neighbour was usually not in the DOM. The first surviving wrap got a bare
  30px margin instead of its real offset and the whole rendered block collapsed
  to the top of the container, while the scroller sat tens of thousands of
  pixels down — so the document pane went blank and no amount of scrolling
  brought it back. Placement is now a sweep over the wraps that are ACTUALLY in
  the DOM (`_repositionPages`), re-run after every insert and every disposal.
  Clicking a thumbnail, End, Home and the page field all land on a painted page
  again.
- **Spreadsheet exports write figures as figures.** The numeric test only
  matched bare digits, so one table arrived with "987" as a number and "1,204"
  beside it as text and Excel would not sum the column. Thousands separators
  now convert, carrying a `#,##0.##` format so the cell still READS the way it
  did in the PDF. Deliberately narrow: commas must group in exact threes, so a
  European decimal comma, currency symbols and percentages stay text rather
  than being silently reinterpreted.
- **Uninstall no longer leaves the PDF association pointing at nothing.**
  electron-builder removes its own ProgID key but leaves
  `Software\Classes\.pdf` still naming it. The uninstaller clears that value —
  only while it is still ours, so a reader chosen since is left alone.
- **Feedback issues get a title someone wrote.** The title was the first 80
  characters of the report, so reports arrived in the tracker cut off
  mid-sentence. The dialog asks for a one-line summary; leaving it empty falls
  back to the old behaviour.
- **You can choose where exports and saved files go.** Settings → Files sets
  the default, and the export dialog shows the destination with a Change… for
  one export only. Downloads is frequently redirected into OneDrive, which
  quietly synced every export to the cloud in an app whose whole promise is
  that nothing leaves the machine unless you choose it.
- **Tests**: the smoke gate builds a real 60-page document and jumps by 1, 2,
  4, 5, 7, 12 and 30 pages, to both ends and 56 pages backwards, asserting a
  page is PAINTED in the viewport each time rather than that the readout
  changed. It then moves and deletes pages deep in that document and undoes it
  all. Every previous probe ran against a 3-page sample, which is why a viewer
  that could not show page 8 passed every gate. `test:office` gains ten
  assertions covering numeric cells, the formats that must stay text, and the
  styles part.

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
