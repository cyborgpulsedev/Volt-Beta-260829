# Before Volt goes to market

The standing list of things that must be true before Volt stops being a beta
and becomes a product people pay attention to. Kept here rather than in chat
because the answer to "what is left?" should survive the session that asked.

Ordered by how much damage each does if it ships unaddressed. Everything not
on this list is polish; everything on it changes whether a stranger can
install Volt, trust it, or reach you.

---

## 1. Windows code-signing certificate — the real blocker

**Status:** open. Volt currently publishes unsigned.

**What a user sees today:** a blue full-screen Microsoft Defender SmartScreen
panel saying "Windows protected your PC — unrecognized app". Running anyway
takes a click on "More info" and then "Run anyway", which most people will
not do for software they have never heard of. It also makes Volt look exactly
like malware behaves, which is the opposite of the pitch.

**What it costs:** a commercial certificate from a CA. An OV certificate is
cheaper but earns SmartScreen reputation slowly — the warning fades over weeks
of installs. An EV certificate carries reputation immediately. Either way the
CA validation takes a few business days.

**How:** `docs/signing-onboarding.md` is the full walkthrough — buying it,
importing it with `npm run sign:setup`, proving it locally, and pointing CI at
it. The release script already refuses to publish with a self-signed or
expired certificate; that guard is waiting for a real one.

## 2. Apple Developer ID certificate — PINNED BY THE OWNER

**Status:** deliberately deferred, 2026-08-31. Not forgotten, not urgent.

The macOS packaging is written, committed and validated as far as a Windows
machine can validate it. It cannot produce a usable build without a
certificate, because macOS refuses unsigned apps outright and will not apply
an update to one.

The certificate needed is **Developer ID Application**, not the App Store
one — same $99/yr Apple Developer membership, different certificate. The App
Store variant cannot ship an app that updates itself.

The five secrets the build needs, and where each comes from, are documented in
the header of `.github/workflows/macos.yml`. Nothing else is required; the
workflow is ready to run the moment they exist.

## 3. A feedback path for people without a GitHub account

**Status:** built, switched off.

The feedback form can post a report to an email relay, which forwards it
without ever exposing the address in the UI or in the page source. The relay
endpoint is empty (`FEEDBACK_RELAY` in `pdf-viewer/js/app.js`), and the button
stays hidden while it is — a button that cannot work loses the report someone
just typed.

Today the only working path is "Draft on GitHub", which requires an account.
Plenty of people who would happily tell you something is broken will not make
one to say so, so this is a real gap in hearing about defects, not just a
convenience.

Turning it on needs an access key from a form-relay service, signed up for
with your own address.

## 4. A privacy statement inside the app — DONE 2026-08-31

**Status:** shipped. The About dialog now carries it.

It states what stays local, then names the only three things that can leave:
a hosted AI provider (which receives part of the document text), feedback you
submit (which carries the open file's NAME, never its contents), and update
and language downloads (no document data, but they reveal an IP like any
download). The smoke asserts all three caveats are still present, because a
privacy statement that quietly loses its exceptions is worse than none.

Original note follows.

**Status was:** missing in the product; present in the README.

Volt is sold on "nothing leaves your machine unless you choose it", and that
claim is true — there is no telemetry, no analytics, and no default cloud
endpoint anywhere in the source. But a person who installs the app and never
reads the repo has no way to see that claim, or to check what the AI features
do with their document.

The beta README has a Privacy section and `pdf-viewer/marketing/` has a
poster. Neither ships inside the app. The About dialog is the obvious home.

## 5. Package metadata gaps

**Status:** small, but they show.

`pdf-viewer/package.json` has no `license`, `homepage` or `repository` field,
and `author` is the bare string "Volt". These surface in the installer's file
properties, in the Linux package metadata, and in the macOS bundle. A blank
publisher reads as unfinished.

---

## Settled, not open

- **Licence: AGPL-3.0**, stated in the beta README. A deliberate choice, and
  one that shapes the commercial options: anyone receiving Volt may
  redistribute the source, and derivative works must carry the same licence.
  Worth re-confirming only if the plan changes to selling a closed build.
- **No telemetry, ads, upsell, cloud sync, or default LLM endpoint.**
  Permanently excluded, per the roadmap.

## Not assessed here

Whether Volt is sold, and how, is not a packaging question and nothing in the
codebase addresses it — there is no licensing, activation, or payment code of
any kind. If the plan is to charge, that is a separate piece of work that has
not been started or scoped.
