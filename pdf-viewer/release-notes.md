## Volt 1.0.9

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

> ### ⚠ Install this one by hand
>
> Automatic updates have never worked. Every release so far downloaded itself quietly in the background and was then discarded before installing, with nothing shown to you — which is why you have had to fetch each version manually.
>
> That is fixed here, but the fix cannot apply itself: the version you already have is the one doing the rejecting. **Download `Volt-Setup-1.0.9.exe` below and run it once.** After that, updates arrive on their own.

**What was wrong.** Volt's installers were signed with a development certificate rather than a purchased one. The updater checks that a downloaded installer is signed by the same publisher, and Windows reports a self-signed certificate as untrusted — so the check failed every time, even though the publisher name matched. Beta builds are now published unsigned, which lets the updater accept them.

**What this changes for you.** Nothing visible. Windows SmartScreen already warned on first launch and still will: click **More info → Run anyway**. Volt still runs entirely on your machine.

**Also in this release** — everything from 1.0.7 and 1.0.8, which most people never received:
- **Pages appear again when you jump.** In any document longer than about six pages, clicking a thumbnail five or more pages away — or pressing End — updated the page number and showed nothing at all. Scrolling and zooming would not bring it back.
- **"Check for updates" answers.** The menu item reported an error every single time, even when a newer version was waiting.
- **Spreadsheet exports produce numbers you can add up.** Figures with thousands separators came out as text, so `1,204` could not be summed while `987` in the same column could.
- **Uninstalling no longer leaves PDFs pointing at a program that is gone.**
- **Feedback reports arrive with a readable title**, from a one-line summary you write.
- **Choose where your files go.** ⚙ Settings → *Files* sets the folder for exports and saved files, and the export dialog lets you send just one somewhere else. Worth checking: Windows often redirects Downloads into OneDrive, so your exports may have been syncing to the cloud.

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
- **Everyone:** download `Volt-Setup-1.0.9.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway". This is the last version you will have to install yourself.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
