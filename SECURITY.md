# Reporting a security problem

Volt reads files you give it, runs a local web engine, and can talk to a model
endpoint you configure. If you find something that could harm a user — a
malicious PDF that escapes the viewer, a path that leaks a document off the
machine, anything involving the signing or password-protection features —
**please don't open a public issue.**

Use GitHub's private reporting instead: the **Security** tab → *Report a
vulnerability*. That opens a private thread visible only to you and the
maintainer. If it isn't available, open an issue saying only that you have a
security report and asking for a private channel — no details in the public
thread.

Please include what you'd need to reproduce it: the file (if you can share
it), the steps, and what you saw. A proof-of-concept document is the most
useful thing you can send.

## What is in scope

- Anything that reads or writes outside the document you opened
- Anything that sends data off the machine without you asking
- Defects in the signing, timestamping or password-protection paths that would
  let a document be forged or silently altered
- Escapes from the renderer into the desktop app

## What is not

- The SmartScreen warning on install. The beta is signed with a development
  certificate rather than a commercial one; that warning is expected and is
  described in the README.
- Anything requiring an attacker who already controls your machine.
- Findings from an automated scanner with no working proof of concept.

## Beta expectations

This is a beta. It is not audited software, and it is signed with a
development certificate. Please don't use it as the only copy of a document
that matters to you — keep the original until you've checked the output.
