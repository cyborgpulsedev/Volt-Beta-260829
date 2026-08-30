## Volt 1.0.8

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**This release fixes reading long documents.** A full beta pass found that jumping more than four pages left the page blank. That is fixed, along with four other defects, and you can now choose where your files are saved.

**Fixed in 1.0.8**
- **"Check for updates" works.** The menu item reported an error every single time, even when a newer version was waiting. Automatic updates were never affected — only the manual check.
- **Pages appear again when you jump.** In any document longer than about six pages, clicking a thumbnail five or more pages away — or pressing End — updated the page number and showed nothing at all. Scrolling and zooming would not bring it back; you had to navigate back to where you started. Every way of moving around a document now lands on a page you can actually see.
- **Spreadsheet exports produce numbers you can add up.** Figures with thousands separators came out as text — so `1,204` could not be summed while `987` in the same column could. They now export as real numbers and still display with their separators. Currency, percentages and decimal commas are deliberately left as text, because converting them would change what the cell means.
- **Uninstalling no longer leaves PDFs pointing at a program that is gone.** The per-user file association survived an uninstall. It is cleared now — unless you have since chosen another reader, in which case yours is left alone.
- **Feedback reports arrive with a readable title.** The title was the first line of whatever you typed, cut off at 80 characters. The feedback dialog now asks for a one-line summary.

**New: choose where your files go**
- **⚙ Settings → Files** sets the folder for exports and saved files.
- The **export dialog** shows where the file is about to land and lets you send just that one somewhere else.
- Worth checking: Windows often redirects Downloads into OneDrive, and if yours is redirected then every export has been syncing to the cloud. Point it at a local folder if you would rather it did not.

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
- **New installs:** download `Volt-Setup-1.0.8.exe` and run it — per-user install, no admin needed, desktop and Start-menu shortcuts. Windows SmartScreen may warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** the built-in updater picks this up automatically.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
