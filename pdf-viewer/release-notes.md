## Volt 1.0.22

Volt is a fast, private, ad-free PDF reader with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**Please update.** This release hands you control over which pages the assistant reads, and fixes a high-severity fault in a component that ships inside the installer.

### You choose which pages the assistant reads

Volt used to pick them for you, by scoring which pages looked relevant to your question. Highlight a single clause, ask about it, and you could get your clause plus six unrelated pages — with no way to say no.

The `Context:` line under the chat box is now a button. It offers three choices:

- **Search automatically** — the old behaviour, still the default, unchanged.
- **Only these pages** — type a page list like `4, 9-12`. Volt skips the guessing entirely; those pages are exactly what the assistant sees.
- **Only my highlighted text** — nothing else from the document goes with the question.

Two things worth knowing:

- **A page list Volt cannot read is refused, not quietly ignored.** Type a page that is not in the document and Volt tells you, rather than silently falling back to searching. A scope you believe is locked but is not would be worse than the guessing it replaces.
- **Your choice resets when you open another document**, because a page list describes one file, not a habit.

### The assistant stops looking frozen

VOLT now lights up in the theme's colours from the moment you send your question until the first words come back. It also stops properly when a reply never arrives, instead of pulsing forever.

The model's name now appears once, on the button that changes it. It used to be repeated three times inside a 340-pixel panel; the line above the button names the provider instead — the one thing the button itself cannot tell you.

### Security

A high-severity fault in `js-yaml`, reached through the updater that ships inside the installer, is fixed. Nothing was known to be exploitable in Volt itself, but the code ships in the binary, so the fix ships in the binary.

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
- **New installs:** download `Volt-Setup-1.0.22.exe` and run it — per-user install, no admin needed. SmartScreen will warn on first launch: click "More info" → "Run anyway".
- **Existing installs:** if you are on 1.0.9 or later, this arrives on its own. If you are on 1.0.8 or earlier, install by hand once — automatic updates were broken before 1.0.9 and the version you have is the one that rejects them.

**Requirements**
- Windows 10 or later, 64-bit
- ~115 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): a 3B model runs comfortably on 8 GB RAM; 8B wants ~16 GB. For chat that can also act on the document — highlight, annotate, navigate — pick a model that supports tool calling; very small models will answer but cannot take action.
