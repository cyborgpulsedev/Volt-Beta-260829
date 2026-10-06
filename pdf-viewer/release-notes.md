## Volt 1.0.24

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**Please update.** This release fixes four high-severity security flaws in the engine Volt runs on, and lets certificates from older Windows and Java exports sign documents.

### Security: four high-severity flaws in the engine underneath Volt

Volt is built on Electron, which carries its own copy of Chrome inside the app. The version shipped in 1.0.23 (Electron 43.4.0) had four published high-severity flaws:

- a window opened from a sandboxed page did not keep that page's sandbox restrictions;
- responses from custom file and web handlers could be read by pages from other sites;
- embedded web content could switch on Node.js in its background workers even when the app had it switched off;
- a compromised page could plant code in the cache that sandboxed startup scripts load from, and have it run on a later load.

**1.0.24 moves to Electron 43.5.0, which fixes all four.** Nothing was known to be exploited through Volt, but the engine ships inside the app, so the fix has to ship inside the app. Volt looks and behaves exactly the same — only the engine underneath changed.

### Certificates from older Windows and Java exports now sign

Digital signing needs a certificate file (`.pfx` or `.p12`). Many older Windows and Java exports protect part of that file with an old scheme called RC2-40. Volt used to refuse those files. It said so clearly and nothing was ever damaged — but if your certificate was one of them, you could not sign with Volt at all.

**Those certificates now open and sign like any other.** The password check is unchanged: a wrong password is still refused before anything is decrypted.

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
- **New installs:** download `Volt-Setup-1.0.24.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** if you are on 1.0.9 or later, this arrives on its own. If you are on 1.0.8 or earlier, install by hand once — automatic updates were broken before 1.0.9 and the version you have is the one that rejects them.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
