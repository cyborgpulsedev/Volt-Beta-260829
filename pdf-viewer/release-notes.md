## Volt 1.0.11

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**Word export keeps your page count.** Exporting to Word used to reflow everything onto Letter-sized pages at 11pt, whatever your document actually was — so a dense A4 report came out at twice its length, and a 207-page document became 471. It now uses your document's own page size, its own margins, and the type size each line was set in. A 60-page test document that exported to 120 pages now exports to 61.

Columns, tables rebuilt from ruling lines, and font matching are still to come. This is the part that decides page count.

**New: text-only exports.** Three additions under Export, for when you want the words and nothing else.

- **Word document — text only (.docx)** — paragraphs in reading order. No tables, no pictures, no attempt at layout. This is the one to use when the full Word export gets your document wrong: it makes no guesses, so it has nothing to get wrong.
- **Plain text (.txt)** — the document's text, with a rule between pages.
- **Tables as CSV (.csv)** — detected tables in one plain file that opens in anything, no spreadsheet required. Accented characters and cells containing commas both survive.

All three respect a page selection made in the Pages manager, and all three offer **Open with…** straight from the toast.

Why they exist: the existing Word and PowerPoint exports analyse every page for tables and pictures. That is what makes them good on a well-behaved document and what makes them slow and occasionally wrong on an awkward one — prose absorbed into a table it isn't part of, or minutes spent extracting images from a scan. The text-only exports skip all of it.

The full Word export that reconstructs columns, tables and page breaks properly is still being built. These are the honest option in the meantime, not a replacement for it.

**Highlights**
- Fully local rendering — vendored pdf.js, works offline, even from `file://`
- Bring your own AI — Ollama, LM Studio, or any OpenAI-compatible endpoint
- Annotate and mark up — highlights, underlines, notes, bookmarks, rectangles, redactions, text editing
- Sign and lock — digital signatures, RFC 3161 timestamping, password-protected exports
- Export anything — PDF, PDF/A-1b, Word, Excel, PowerPoint, Markdown, TSV, and now text-only Word, TXT and CSV
- Built-in OCR with English bundled and 20+ more languages on demand
- Page management — add, delete, reorder, insert from another PDF, two-page book spread
- Read aloud with local voices, and talk to the AI with your microphone

**Install**
- **New installs:** download `Volt-Setup-1.0.11.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** if you are on 1.0.9, this arrives on its own. If you are on 1.0.8 or earlier, install by hand once — automatic updates were broken before 1.0.9 and the version you have is the one that rejects them.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
