## Volt 1.0.6

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**This release makes saved files small again**, gives every dialog a working Escape key, and lets you turn the AI's document actions off. It also delivers the brand icon and the corrected download links that the 1.0.5 notes described but that release was cut too early to include.

**Fixed in 1.0.6**
- **Saved files keep their size.** Reordering two pages of a 4.7 MB document produced a 24.4 MB file — every shared font and image was copied again for each page. The same save is now 4.77 MB and takes 0.67 s instead of 2.3 s. A plain save with annotations no longer grows the file either: only Secure, Sign and PDF/A rewrite the document in the older form those features actually need.
- **Escape closes the dialog you are looking at.** Seven dialogs — Secure, Sign, Setup, Feedback, Signature, Form field and the `file://` notice — had no Escape key, no focus trap and no dimmed background, and a dialog opened while a markup tool was active could not be closed from the keyboard at all. Escape now always closes the top layer first, and clicking outside works the same way.
- **You can turn the AI's document actions off.** A switch in Settings and one in the chat footer. Both explain plainly that a local model may ignore an action, or claim to have taken one it never took.
- **Models that cannot take actions now say so.** Ollama reports per-model capabilities, and the model picker marks the ones without action support instead of offering them silently — `gemma3:1b` was answering "the phrase is highlighted on page 1" having highlighted nothing.
- **The AI no longer prints its own plumbing.** Some models write a tool call out as text instead of making it; the answer inside is unwrapped and shown, and stray schema dumps are dropped. JSON inside ordinary prose is left alone.
- **Volt appears in Programs and Features with its install location.** The uninstall entry was missing the path, so inventory and cleanup tools saw an app installed nowhere.
- **The brand icon ships.** The V-and-bolt icon now appears on the taskbar, Start menu, desktop and PDF files. 1.0.5 was cut two commits before it landed.
- **Download links reach a page you can open.** The README and landing page pointed at a repository beta testers cannot see.

**Highlights**
- Fully local rendering — vendored pdf.js, works offline, even from `file://`
- Bring your own AI — Ollama, LM Studio, or any OpenAI-compatible endpoint
- Annotate and mark up — highlights, underlines, notes, bookmarks, rectangles, redactions, text editing
- Sign and lock — digital signatures, RFC 3161 timestamping, password-protected exports
- Export anything — PDF, PDF/A-1b, Word, Excel, PowerPoint, Markdown, TSV
- Built-in OCR with English bundled and 20+ more languages on demand
- Page management — add, delete, reorder, insert from another PDF, two-page book spread
- Read aloud with local voices, and talk to the AI with your microphone

**Install**
- **New installs:** download `Volt-Setup-1.0.6.exe` and run it — per-user install, no admin needed, desktop and Start-menu shortcuts. Windows SmartScreen may warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** the built-in updater picks this up automatically.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
