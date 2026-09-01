## Volt 1.0.18

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

A small release: it fixes what Volt tells you about itself.

**The release notes inside Volt are readable again.** The About box and the update tooltip both show the notes for your version, and both were showing them wrong. The asterisks that mark each entry's bold heading were printed as literal text, so the notes read like source code. Worse, only the first line of each entry ever appeared — the notes are written wrapped at a fixed width, so every one of them was cut off after about twelve words, usually mid-clause. Entries now appear in full, with their headings actually bold.

Both views are drawn by the same code on purpose, so what you read in the About box and what you read in the update tooltip cannot drift apart.

**Links the AI writes are clickable again.** A link in an assistant reply came out as broken markup instead of something you could follow. The same renderer was behind it, so the fix covers both.

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
- **New installs:** download `Volt-Setup-1.0.18.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** if you are on 1.0.9, this arrives on its own. If you are on 1.0.8 or earlier, install by hand once — automatic updates were broken before 1.0.9 and the version you have is the one that rejects them.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
