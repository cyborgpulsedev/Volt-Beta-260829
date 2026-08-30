# Volt — public beta

A fast, private, ad-free PDF reader with AI built in. Everything renders on your machine, and you bring your own model. No account, no telemetry, no upsells.

This repository is the **beta channel**: a snapshot of the app's source plus the installers you can download and run. Development happens elsewhere; what lands here is what's ready for you to try.

## What "beta" means here

Volt is being tested in the open, which means two honest caveats.

**It is not code-signed.** That is why Windows SmartScreen warns you on first launch. The warning is real and worth taking seriously with software generally — this is a case where you know where the download came from and no certificate has been bought yet. Builds were previously signed with a self-signed certificate, which Windows treats as untrusted anyway; worse, it made the updater reject every update it downloaded, so nobody ever received one. Publishing unsigned is what lets updates actually install. A commercial certificate is the proper fix and is not in place yet.

**It has not been security-audited, and it edits your documents.** Keep the original of anything that matters until you've opened the saved copy and checked it. Volt never deletes or overwrites your source file on its own, but a beta is exactly the wrong place to find out you had only one copy.

Everything runs on your machine. Nothing is sent anywhere unless you point the chat at a hosted model, and then only what you ask about goes to the endpoint you chose. There is no account, no telemetry, and no analytics — which also means the only way I learn something broke is if you tell me.

## Install

1. Open the [latest release](https://github.com/cyborgpulsedev/Volt-Beta-260829/releases/latest) and download **`Volt-Setup-<version>.exe`**.
2. Run it. It installs for your user only — no admin rights, no UAC prompt.
3. Windows SmartScreen will warn on first launch, because beta builds are not code-signed. Click **More info → Run anyway**.
4. Updates arrive on their own. Volt checks this repository's releases on startup, downloads in the background, and asks before restarting.

**Requirements:** Windows 10 or later, 64-bit. About 115 MB to download. The app works fully offline.

To remove it: Settings → Apps → *Volt* → Uninstall. Your annotations and settings live in `%APPDATA%\Volt` and are left alone unless you delete that folder yourself.

## Your first five minutes

1. **Open a PDF** — drag it onto the window, or use **☰ → Open**. Large documents stream in; the first page paints before the rest is parsed.
2. **Find something** — `Ctrl+F`. Matches are counted across the whole document and highlighted as you move between them.
3. **Mark it up** — pick Highlight from the toolbar and drag across a line. Underline, strikethrough, notes, rectangles and redactions sit next to it. `Esc` puts the tool away; `Ctrl+Z` undoes.
4. **Save it** — **☰ → Save as** writes a normal PDF that any reader opens, with your markup baked in. The file arrives in Downloads under its real name and stays about the size it started.
5. **Ask it something** *(only if you connected a model — see below)* — open the chat panel and ask about a page by name: "what does page 12 say?" pins that page for the model rather than guessing.

Everything above works with no model, no account and no network.

## Connecting a model (optional)

Volt reads and edits PDFs perfectly well with no AI at all. If you want the chat panel, point it at a model you run:

- **[Ollama](https://ollama.com)** — Volt finds it automatically at `http://localhost:11434` and lists what you have installed.
- **LM Studio**, or anything else that speaks the OpenAI API — set the base URL in ⚙ Settings.
- A hosted key (Anthropic, OpenAI, Google) also works, if you'd rather not run a model locally.

**A word about model choice.** Volt can let the AI *act* on the document — highlight a phrase, add a note, jump to a page, save. Not every local model can do that, and not every model that can does it well: some answer in prose instead, and a few will tell you they highlighted something when they didn't. Volt marks models your server reports as unable to use those actions, and you can turn actions off entirely from the chat footer or ⚙ Settings if replies feel slow.

Rough guide on a machine with 8 GB of VRAM: a 3B model answers in seconds and uses actions reliably; an 8B model is noticeably slower per reply but reasons better; anything larger will spill to CPU and you will feel it.

## What's here

- **Reading** — vendored pdf.js, continuous / single-page / two-page spread, fit-width and fit-page, rotation, and three skins (Neon, Paper, Quiet)
- **Markup** — highlights, underlines, strikethrough, notes, rectangles, redactions, in-place text editing, bookmarks
- **Signing** — hand-drawn or typed signatures, digital signatures with RFC 3161 timestamping, password-protected exports
- **Export** — PDF, PDF/A-1b, Word, Excel, PowerPoint, Markdown, TSV, and a portable JSON backup of your annotations
- **Text-only export** — Word, plain text and CSV for when you want the words and nothing else: no tables, no pictures, no guess at layout, so nothing to get wrong
- **OCR** — built in, English included, 20+ more languages downloaded on demand
- **Pages** — add, delete, reorder by drag, insert from another PDF, with undo
- **Voice** — read aloud with local voices, and talk to the AI with your microphone

## What to test

[TESTING.md](TESTING.md) is a checklist you can work through — opening, navigating, markup, pages, exports, OCR, AI, signing — with the traps worth poking at called out. You don't have to do all of it; a real task with a real document beats a full pass over a sample file.

## Where your files go

Exports and saved files land in your Downloads folder by default. **Windows often redirects Downloads into OneDrive**, and if yours is redirected then everything you export syncs to the cloud — which is not what an app like this should do quietly. Check ⚙ Settings → *Files* to see where they are actually going, and point it at a local folder if you would rather they stayed on the machine. The export dialog also shows the destination and lets you send one export somewhere else without changing the default.

## Telling us what broke

Open an [issue](https://github.com/cyborgpulsedev/Volt-Beta-260829/issues) — or use **☰ → Send feedback** in the app, which opens the same place with your version already filled in.

What makes a report easy to act on:

- the version, from **☰ → About**
- what you did, what happened, and what you expected instead
- the document, if you can share it — and if you can't, whether it was scanned, exported from a particular program, or unusually large
- for AI problems, the model name and whether document actions were on

Anything that involves a document you can't share is still worth reporting; say what you can and we'll work from that.

## Privacy

| | |
|---|---|
| No ads | No telemetry |
| No account required | No cloud storage |
| No upsells | Open source (AGPLv3) |

Nothing leaves your machine unless you point the chat at a hosted model, and then only what you ask about goes to the endpoint you chose.

## Licence

[AGPL-3.0](LICENSE) — use it, modify it, ship it; but share your changes under the same licence.

---

Built by [Cyborg Pulse](https://github.com/cyborgpulsedev)
