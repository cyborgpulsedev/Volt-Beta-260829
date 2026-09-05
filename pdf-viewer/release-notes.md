## Volt 1.0.20

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**A page could go missing from the thumbnail strip.** If you opened a second document before the strip down the left had finished drawing, it could be left permanently one page short — and a thumbnail it did show could be a picture of a page from the document you had just closed. Bigger documents and slower machines hit it more often, because the strip takes longer to finish.

Your document was never damaged. Every page was always there, and printing, exporting, signing and saving were never affected — it was the strip that was wrong about what the file contained. If you have ever thought Volt had dropped a page, this is almost certainly what you saw.

This is fixed. The drawing pass for a document you have moved on from can no longer write into the strip of the one you are now reading.

Nothing else about using Volt changes in this release.

One limitation worth restating: certificates protected with the older RC2-40 encryption, which some older Windows exports produce, are still not supported. Volt says so clearly instead of failing partway through.

**Highlights**
- Fully local rendering — vendored pdf.js, works offline, even from `file://`
- Bring your own AI — Ollama, LM Studio, or any OpenAI-compatible endpoint
- Annotate and mark up — highlights, underlines, notes, bookmarks, rectangles, redactions, text editing
- Sign and lock — digital signatures, RFC 3161 timestamping, password-protected exports
- Export anything — PDF, PDF/A-1b, Word, Excel, PowerPoint, Markdown, TSV, and text-only Word, TXT and CSV
- Built-in OCR with English bundled and 20+ more languages on demand
- Page management — add, delete, reorder, insert from another PDF, two-page book spread
- Read aloud with local voices, and talk to the AI with your microphone

**Install**
- **New installs:** download `Volt-Setup-1.0.20.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** if you are on 1.0.9 or later, this arrives on its own. If you are on 1.0.8 or earlier, install by hand once — automatic updates were broken before 1.0.9 and the version you have is the one that rejects them.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
