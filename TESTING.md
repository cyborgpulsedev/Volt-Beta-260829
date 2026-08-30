# Beta testing checklist

You don't have to do all of this. Pick the sections that match how you'd actually use a PDF reader — a real task with a real document is worth more than a full pass with a sample file.

**Before you start:** note your version from **☰ → About**. Report anything odd with **☰ → Send feedback**, which fills the version in for you. Check the [pinned known issues](../../issues) first so you don't spend time on something already logged.

**A tip that makes any report ten times more useful:** say what you did, what happened, and what you expected instead. If a document is involved and you can share it, attach it. If you can't, say what kind it is — scanned, exported from a particular program, unusually large, password-protected.

---

## Opening and reading

- [ ] Open a PDF by dragging it onto the window
- [ ] Open one from **☰ → Open**
- [ ] Open a **large** document (100+ pages) — how long until the first page appears?
- [ ] Open a **scanned** document (no selectable text)
- [ ] Open something exported from an unusual program — a CAD tool, a bank statement, a form
- [ ] Open a password-protected PDF
- [ ] Reopen a document you had open before — does it return to where you were?
- [ ] Open a second document, then go back to the first — is the sidebar showing the right pages?

## Moving around

- [ ] Scroll continuously through several pages
- [ ] **Jump a long way** — click a thumbnail far down the sidebar, or press End
- [ ] Jump back to the beginning with Home
- [ ] Use the page number in the status bar — does it match the page you're looking at?
- [ ] Zoom in and out; check **Fit width** and **Fit page**
- [ ] Try **One page**, **Two pages** and **Continuous** from the View menu
- [ ] Rotate the view
- [ ] Switch themes (Neon, Paper, Quiet) and check nothing becomes unreadable

## Finding things

- [ ] Search for a common word — is the match count right, and is it quick?
- [ ] Step through matches with the next/previous arrows
- [ ] Search for something that isn't there
- [ ] Search a scanned document **after** running OCR

## Marking up

- [ ] Highlight by dragging across a line — including a **perfectly flat, straight** drag
- [ ] Highlight across several lines, and across a column break
- [ ] Underline and strikethrough
- [ ] Add a note, reopen it, edit it
- [ ] Draw a rectangle; move and resize it
- [ ] Redact something, save, and confirm the text is really gone from the saved file
- [ ] Undo and redo several times in a row
- [ ] Press Escape while a tool is active — does it put the tool away?
- [ ] Close and reopen the document — is your markup still there?

## Pages

- [ ] Open the pages manager and delete a page, then undo
- [ ] Reorder pages by dragging
- [ ] Insert pages from another PDF
- [ ] Add a blank page
- [ ] Apply the changes, save, and reopen — did your markup follow the pages it was on?

## Saving and exporting

- [ ] **Save as** a normal PDF and open the result in whatever you usually use
- [ ] Check the saved file is a sensible size — not several times the original
- [ ] Export to **Word** and open it in Word or LibreOffice
- [ ] Export to **Excel** — check numbers behave as numbers, and try summing a column
- [ ] Export to **PowerPoint**
- [ ] Export **Markdown notes** and the **JSON backup**
- [ ] Export **PDF/A** and, if you have a validator, check it
- [ ] Confirm files land in Downloads under their real names, not as `.tmp`
- [ ] Export a **password-protected** PDF and confirm the password is required to open it
- [ ] Restore from a JSON backup into a fresh copy of the document

## OCR

- [ ] Run OCR on a scanned document — roughly how long per page?
- [ ] Search the recognised text
- [ ] Highlight recognised text — does the highlight sit on the words?
- [ ] Copy recognised text and paste it somewhere — check the spacing
- [ ] Download another language and OCR in it

## AI (only if you've connected a model)

- [ ] Ask a question about the document generally
- [ ] Ask about a **specific page** — "what does page 12 say?" — and check the answer really comes from that page
- [ ] Check the page citation it gives you
- [ ] Ask it to **do** something — highlight a phrase, add a note, jump to a page — then verify it actually happened. Some models claim actions they never took
- [ ] Turn document actions off in the chat footer and confirm it still answers
- [ ] Switch models and compare

## Signing and locking

- [ ] Draw and place a signature
- [ ] Type a signature instead
- [ ] Apply a digital signature, then verify it in Acrobat or another reader
- [ ] Add a timestamp
- [ ] Password-protect an export and try the permission checkboxes

## Voice

- [ ] Read a page aloud; pause and resume
- [ ] Change the voice
- [ ] Talk to the AI with the microphone

## Around the edges

- [ ] Resize the window small and large — does the toolbar stay usable?
- [ ] Change a setting, restart, and confirm it stuck
- [ ] Edit the open file in another program — does Volt notice?
- [ ] Work fully offline
- [ ] Leave it open for a few hours with a large document and see whether it slows down
- [ ] Install an update when one is offered
- [ ] Uninstall, and check what's left behind

---

## When something breaks

1. Note what you were doing and which page you were on.
2. Note the version from **☰ → About**.
3. Use **☰ → Send feedback**, or [open an issue](../../issues/new/choose).
4. If it happens every time, say so — reliably reproducible bugs get fixed first.

Reporting "this felt slow" or "I couldn't work out how to do X" is genuinely useful too. Confusion is a defect.
