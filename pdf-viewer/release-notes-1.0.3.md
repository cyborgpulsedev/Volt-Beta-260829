## Volt 1.0.3 — Neon rebrand

Volt is a fast, private, ad-free PDF reader/editor with AI built in — everything renders locally, and you bring your own LLM. No account, no telemetry, no upsells.

**What's new in 1.0.3**
- **Cypul Neon theme** — the app chrome now uses the cyan/violet/magenta Neon palette (`#2FE6FF` / `#A855F7` / `#FF3BC8`) with Jost body text.
- **Neon / Quiet skins** — a new skin picker in View ▸. Neon keeps the full cyan glow; Quiet desaturates the accents and dials the glow down for long reading.
- **Library 3 AM logo** — the VOLT wordmark is now the one-line neon display face, bundled locally, applied to the toolbar and the Windows shortcut / PWA icons.
- **Settings model picker** — the Ollama model field populates from the native `/api/tags` endpoint (every pulled model), with a `/v1/models` fallback for older Ollama installs.
- **Marketing posters** — five Neon-branded posters matching the new look.

**Install**
- **New installs:** download `Volt-Setup-1.0.3.exe` and run it — per-user install, no admin needed, desktop + Start-menu shortcut, and `.pdf` files open in Volt automatically.
- **Existing installs:** updates apply automatically through the built-in updater.

**Requirements**
- Windows 10 or later, 64-bit
- ~120 MB installer; the app runs fully offline, nothing leaves your machine
- Local AI models (optional): qwen3 1.7b runs on 4–8 GB RAM, 4b needs ~8 GB, 8b ~16 GB
