## Volt 1.0.19

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**Digital signing works with every certificate.** If you have ever tried to sign a PDF in Volt and been told "Invalid keyData", this release is why it happened and the end of it. Signing failed for roughly one certificate in sixteen — consistently, for those certificates, so it had never worked and never would have. It was not your file, not your password, and nothing you could have done differently: Volt was damaging the certificate as it opened it, by stripping a piece of internal padding that had already been stripped. Whether you were affected came down to the last byte of your particular private key.

A second, rarer fault could accept a wrongly-decoded password as correct and then use the resulting rubbish as your key. Volt now verifies it has a real key before going any further.

If signing has been failing for you, no action is needed beyond updating — your existing certificate will work.

**Export no longer offers itself when there is nothing to export.** With no document open, the Export item still looked available and silently did nothing. It is greyed out until you open a file.

One limitation worth stating plainly: certificates protected with the older RC2-40 encryption, which some older Windows exports produce, are still not supported. Volt says so clearly instead of failing partway through.

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
- **New installs:** download `Volt-Setup-1.0.19.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** if you are on 1.0.9, this arrives on its own. If you are on 1.0.8 or earlier, install by hand once — automatic updates were broken before 1.0.9 and the version you have is the one that rejects them.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
