/* ═══════════════════════════════════════════════════════════════
   OFFICE EXPORT — Word (.docx), Spreadsheet (.xlsx), PowerPoint
   (.pptx), TSV
   Pure, dependency-free generators: OOXML (docx/pptx) and
   SpreadsheetML (xlsx) are just ZIP archives of XML, so the writers
   here build the archives directly with a store-only ZIP writer +
   CRC32 — no external libraries, no network, works offline. Also the
   content detection: tables and images from the pdf.js operator
   list. Tables are found TWO ways, combined per page: the text-gap
   heuristic (column-aligned text runs) for regular tables, and the
   vector-grid detector (drawn gridlines — stroked rects/lines from
   OPS.constructPath) which also sees gridlines-only tables (blank
   forms) and merged cells (text assigned to the drawn grid by
   position, so a wide cell flattens to one column with empty
   neighbors).

   The pure parts (zip, docx, xlsx, pptx, detect, group, tsv, grids)
   touch no DOM and are unit-tested in scripts/test-office.mjs;
   collect()/detectImages()/encodeImage()/detectGrids() need pdf.js
   + a canvas and run only in the app (they are guarded, so loading
   the module in Node is safe).
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  const OE = {};

  /* ── CRC32 (standard table) ─────────────────────────────────── */
  const CRC_TABLE = (function () {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  OE.crc32 = function (bytes) {
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  /* ── ZIP writer (store-only; Word/Excel/LibreOffice/Google all
        accept stored entries, so no DEFLATE dependency) ────────── */
  OE.zip = function (files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const DOS_DATE = 22561; // fixed 2024-01-01 so outputs are byte-deterministic
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.bytes;
      const crc = OE.crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true); // UTF-8 filename flag
      dv.setUint16(8, 0, true);      // method 0 = stored
      dv.setUint16(10, 0, true);
      dv.setUint16(12, DOS_DATE, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);
      central.push({ nameBytes, crc, size: data.length, offset });
      offset += local.length + data.length;
    }
    const cdStart = offset;
    const cd = [];
    for (const c of central) {
      const rec = new Uint8Array(46 + c.nameBytes.length);
      const dv = new DataView(rec.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, DOS_DATE, true);
      dv.setUint32(16, c.crc, true);
      dv.setUint32(20, c.size, true);
      dv.setUint32(24, c.size, true);
      dv.setUint16(28, c.nameBytes.length, true);
      for (let k = 30; k <= 40; k += 2) dv.setUint16(k, 0, true);
      dv.setUint32(42, c.offset, true);
      rec.set(c.nameBytes, 46);
      cd.push(rec);
      offset += rec.length;
    }
    const eocd = new Uint8Array(22);
    const dv = new DataView(eocd.buffer);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(8, central.length, true);
    dv.setUint16(10, central.length, true);
    dv.setUint32(12, offset - cdStart, true);
    dv.setUint32(16, cdStart, true);
    const out = new Uint8Array(offset + 22);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    for (const c of cd) { out.set(c, p); p += c.length; }
    out.set(eocd, p);
    return out;
  };

  /* ── XML escaping ───────────────────────────────────────────── */
  OE.xml = function (s) {
    return String(s == null ? "" : s)
      // XML 1.0 allows NO control character except tab/LF/CR, and no unpaired
      // surrogate. pdf.js returns raw glyph codes for fonts with a symbolic
      // encoding, so one such page put 0x01-0x1E straight into document.xml
      // and Word/PowerPoint then refused to open the WHOLE export ("Word
      // experienced an error trying to open the file"). Strip them here — the
      // one choke point every docx/xlsx/pptx string passes through.
      .replace(/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
      .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, "$1")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  };

  /* ── DOCX ───────────────────────────────────────────────────── */
  const CT_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";

  const RELS_ROOT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';

  // `id` must be the NUMERIC drawing-element id (ST_DrawingElementId =
  // xsd:unsignedInt). Passing the relationship id ("rIdImg1") made Word reject
  // the whole file — "Word experienced an error trying to open the file" — so
  // every export of a PDF containing an image was dead on arrival, while
  // text-only exports opened fine. `rid` stays the r:embed relationship.
  function docxImageDrawing(img, rid, id) {
    const cx = Math.round(img.wPts * 12700), cy = Math.round(img.hPts * 12700);
    return '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="Picture ' + id + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="Picture ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      "</a:graphicData></a:graphic></wp:inline>";
  }

  function docxTable(grid) {
    const rows = grid.map((row) =>
      "<w:tr>" + row.map((cell) =>
        "<w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/></w:tcPr>" +
        '<w:p><w:r><w:t xml:space="preserve">' + OE.xml(cell) + "</w:t></w:r></w:p></w:tc>"
      ).join("") + "</w:tr>"
    ).join("");
    return "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders>" +
      '<w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/>' +
      "</w:tblBorders></w:tblPr>" + rows + "</w:tbl>";
  }

  /** Build a .docx from a collected document:
      { title, pages: [{ num, paragraphs: [{text}], tables: [[[cell]]], images: [{bytes, mime, wPts, hPts}] }] }
      Returns a Uint8Array. */
  OE.docx = function (doc) {
    const docRels = [];
    let imgSeq = 0;
    let body = "";
    // title
    if (doc.title) {
      body += '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:pPr>' +
        "<w:r><w:rPr><w:b/><w:sz w:val=\"36\"/></w:rPr><w:t>" + OE.xml(doc.title) + "</w:t></w:r></w:p>";
    }
    for (let pi = 0; pi < doc.pages.length; pi++) {
      const pg = doc.pages[pi];
      /* The page break and the page label both cost vertical space on EVERY
         page, and a source page whose text already fills its height then
         spills a line onto a second Word page — which is how a 60-page report
         came out at exactly 120. The break paragraph is collapsed to a
         hairline (1 twip, 1-half-point text) and the label is set tight, so
         neither pushes the body over. */
      if (pi > 0) {
        body += '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>' +
          '<w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>' +
          '<w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:br w:type="page"/></w:r></w:p>';
      }
      /* No "Page N" label. The source page did not have one, and a page whose
         text already fills its height spills onto a second Word page the
         moment anything is added to it — measured: 60 A4 pages declared 778pt
         of content into 762pt of usable height, and every single one of them
         overflowed. The page number is in the document itself where the
         author put it; plain-text export still rules its pages, because there
         a reader has nothing else to go on. */
      for (const para of pg.paragraphs || []) {
        const t = String(para.text || "").trim();
        if (!t) continue;
        /* Set each line at the size it was set in, on the leading it had.
           Word's 11pt default over an 8pt source is half again the height per
           line, which is what doubled a dense report's page count. lineRule
           "exact" is what stops Word adding its own leading on top of that;
           the floor keeps a glyph from being clipped when a line's measured
           leading is tighter than its own size, which superscripts and rule
           lines both produce. */
        const sz = para.size > 3 && para.size < 200 ? para.size : 0;
        const lead = para.lead > 0 ? Math.max(para.lead, (sz || 11) * 1.02) : 0;
        const szTag = sz ? '<w:sz w:val="' + Math.round(sz * 2) + '"/>' : "";
        const ft = para.font;
        const fontTag = ft
          ? '<w:rFonts w:ascii="' + OE.xml(ft.family) + '" w:hAnsi="' + OE.xml(ft.family) +
            '" w:cs="' + OE.xml(ft.family) + '"/>' + (ft.bold ? "<w:b/>" : "") + (ft.italic ? "<w:i/>" : "")
          : "";
        const runPr = fontTag || szTag ? "<w:rPr>" + fontTag + szTag + "</w:rPr>" : "";
        const spacing = lead
          ? '<w:spacing w:before="0" w:after="0" w:line="' + Math.round(lead * 20) + '" w:lineRule="exact"/>'
          : '<w:spacing w:after="80"/>';
        body += "<w:p><w:pPr>" + spacing + runPr + "</w:pPr>" +
          "<w:r>" + runPr + '<w:t xml:space="preserve">' + OE.xml(t) + "</w:t></w:r></w:p>";
      }
      for (const grid of pg.tables || []) body += docxTable(grid);
      for (const img of pg.images || []) {
        imgSeq++;
        const ext = img.mime === "image/jpeg" ? "jpeg" : "png";
        const rid = "rIdImg" + imgSeq;
        const file = "media/image" + imgSeq + "." + ext;
        docRels.push({ rid, file, bytes: img.bytes, mime: img.mime });
        body += '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
          '<w:r><w:drawing>' + docxImageDrawing(img, rid, imgSeq) + "</w:drawing></w:r></w:p>";
      }
    }
    /* The section carries ONE page size, so a mixed-size document picks the
       size most of its pages share rather than forcing everything to Letter —
       an A4 report reflowed onto Letter loses a line a page and gains a page
       every sixty. Margins come from where the text actually sits. */
    const pgs = dominantPageSize(doc.pages || []);
    const mar = textMargins(doc.pages || [], pgs);
    const tw = (ptv) => Math.round(ptv * 20);   // 1pt = 20 twips
    const sectPr = '<w:sectPr><w:pgSz w:w="' + tw(pgs.w) + '" w:h="' + tw(pgs.h) + '"' +
      (pgs.w > pgs.h ? ' w:orient="landscape"' : "") + "/>" +
      '<w:pgMar w:top="' + tw(mar.top) + '" w:right="' + tw(mar.right) + '" w:bottom="' + tw(mar.bottom) +
      '" w:left="' + tw(mar.left) + '" w:header="' + tw(Math.min(mar.top, 36)) +
      '" w:footer="' + tw(Math.min(mar.bottom, 36)) + '" w:gutter="0"/></w:sectPr>';
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      "<w:body>" + body +
      sectPr +
      "</w:body></w:document>";

    const docRelsXml = RELS_ROOT +
      docRels.map((r) =>
        '<Relationship Id="' + r.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + r.file + '"/>'
      ).join("") +
      "</Relationships>";

    const files = [
      { name: "[Content_Types].xml", bytes: OE.utf8(CT_XML) },
      { name: "_rels/.rels", bytes: OE.utf8(RELS_ROOT + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
      { name: "word/document.xml", bytes: OE.utf8(documentXml) },
      { name: "word/_rels/document.xml.rels", bytes: OE.utf8(docRelsXml) },
    ];
    for (const r of docRels) files.push({ name: "word/" + r.file, bytes: r.bytes });
    return OE.zip(files);
  };

  /* ── XLSX ───────────────────────────────────────────────────── */
  const XLSX_NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  function colName(i) { // 1-based → A, B, ... Z, AA ...
    let s = "";
    let n = i;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function sheetName(s, used) {
    let n = String(s || "Sheet").replace(/[[\]*?:/\\]/g, " ").replace(/\s+/g, " ").trim() || "Sheet";
    n = n.slice(0, 31);
    let cand = n, k = 2;
    while (used.has(cand)) cand = n.slice(0, 27) + " " + k++;
    used.add(cand);
    return cand;
  }
  /* A cell that LOOKS like a figure should arrive in Excel as a figure, or the
     column will not sum. Thousands separators are the common case and used to
     fall through to text, so one table exported a mix: "987" became a number
     while "1,204" beside it stayed a string.

     Deliberately conservative. Only a bare number, or one whose commas group
     digits in exact threes, converts — "1,5" is left alone because it is a
     decimal comma in half the world, and currency, percentages and accounting
     parentheses keep their text because dropping the symbol would change what
     the cell means. Returns the unformatted value, or null to keep it text. */
  const NUMERIC_CELL = /^[+-]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/;
  function numericCellValue(t) {
    const v = String(t).trim();
    if (!NUMERIC_CELL.test(v)) return null;
    const plain = v.split(",").join("").replace(/^\+/, "");
    return Number.isFinite(Number(plain)) ? plain : null;
  }
  function isNumericCell(t) { return numericCellValue(t) !== null; }

  OE.xlsx = function (opts) {
    const sheets = (opts && opts.sheets) || [];
    const used = new Set();
    const named = sheets.map((s) => ({ name: sheetName(s.name, used), rows: s.rows || [] }));
    const sheetXmls = named.map((s) => {
      const rows = s.rows.map((row, ri) => {
        const cells = (row || []).map((c, ci) => {
          const ref = colName(ci + 1) + (ri + 1);
          const t = String(c == null ? "" : c);
          const num = numericCellValue(t);
          // s="1" is the #,##0.## format below, so a grouped figure still READS
          // the way it did in the PDF while behaving as a number
          if (num !== null) return '<c r="' + ref + '"' + (t.indexOf(",") >= 0 ? ' s="1"' : "") + "><v>" + num + "</v></c>";
          return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + OE.xml(t) + "</t></is></c>";
        });
        return '<row r="' + (ri + 1) + '">' + cells.join("") + "</row>";
      });
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<worksheet ' + XLSX_NS + "><sheetData>" + rows.join("") + "</sheetData></worksheet>";
    });
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      named.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
      "</Types>";
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<sheets>" + named.map((s, i) => '<sheet name="' + OE.xml(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>";
    const wbRels = RELS_ROOT +
      named.map((s, i) =>
        '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'
      ).join("") +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>";
    /* Minimal styles part. cellXfs[0] is General (every text cell); cellXfs[1]
       applies numFmt 164 (#,##0.##) so a figure that carried thousands
       separators in the PDF still displays with them. */
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts>' +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      "</cellXfs></styleSheet>";
    const files = [
      { name: "[Content_Types].xml", bytes: OE.utf8(types) },
      { name: "_rels/.rels", bytes: OE.utf8(RELS_ROOT + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
      { name: "xl/workbook.xml", bytes: OE.utf8(workbook) },
      { name: "xl/_rels/workbook.xml.rels", bytes: OE.utf8(wbRels) },
      { name: "xl/styles.xml", bytes: OE.utf8(styles) },
    ];
    sheetXmls.forEach((x, i) => files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", bytes: OE.utf8(x) }));
    return OE.zip(files);
  };

  /* ── PPTX (PowerPoint / Google Slides / LibreOffice Impress) ──
     Each detected table becomes a slide (rows chunked if they exceed
     the slide height), each image becomes a slide, and every page's
     prose gets its own text slide — the whole document as a deck.
     The presentation is a minimal-but-valid OOXML package: one
     slideMaster + one blank layout + one theme (with the standard
     Medium Style 2 table style the table slides reference). */
  const EMU_W = 12192000, EMU_H = 6858000; // 16:9 slide
  const M = 600000;                        // slide margin
  const CW = EMU_W - 2 * M;                // content width
  const PPT_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const DRAWML_TABLE = "http://schemas.openxmlformats.org/drawingml/2006/table";
  const TABLE_STYLE = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"; // Medium Style 2 - Accent 1
  const P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  /** One text run: <a:r> with size/bold/color. o: { sz, b, color }. */
  function aRun(text, o) {
    o = o || {};
    let pr = '<a:rPr lang="en-US" sz="' + (o.sz || 1800) + '"';
    if (o.b) pr += ' b="1"';
    if (o.color) pr += '><a:solidFill><a:srgbClr val="' + o.color + '"/></a:solidFill></a:rPr>';
    else pr += "/>" ;
    return "<a:r>" + pr + "<a:t>" + OE.xml(text) + "</a:t></a:r>";
  }

  /** Text box shape. paras: [{ text|runs, sz, b, color, spaceAfter }]. */
  function spTextBox(id, x, y, cx, cy, paras, autofit) {
    const body = paras.map((p) => {
      const runs = p.runs ? p.runs.map((r) => aRun(r.text, r)).join("") : aRun(p.text, p);
      return "<a:p>" + (p.spaceAfter ? '<a:pPr spcAft="' + p.spaceAfter + '"/>' : "") + runs + "</a:p>";
    }).join("");
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
      "<p:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\">" + (autofit ? "<a:normAutofit/>" : "") + "</a:bodyPr><a:lstStyle/>" + body + "</p:txBody></p:sp>";
  }

  /** Table shape in a graphicFrame. grid: [[cell]]. */
  function spTable(id, x, y, grid, rowH) {
    const nCols = grid[0].length;
    const weights = [];
    for (let c = 0; c < nCols; c++) {
      let maxLen = 2;
      for (const row of grid) maxLen = Math.max(maxLen, String(row[c] == null ? "" : row[c]).length);
      weights.push(maxLen + 2);
    }
    const totalW = weights.reduce((a, b) => a + b, 0);
    const colWs = weights.map((w) => Math.round(CW * w / totalW));
    const rows = grid.map((row) =>
      "<a:tr h=\"" + rowH + "\">" + row.map((cell) =>
        "<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>" + aRun(String(cell == null ? "" : cell), { sz: 1400 }) +
        "</a:p></a:txBody><a:tcPr/></a:tc>"
      ).join("") + "</a:tr>"
    ).join("");
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Table ' + id + '"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + CW + '" cy="' + (rowH * grid.length) + '"/></p:xfrm>' +
      '<a:graphic><a:graphicData uri="' + DRAWML_TABLE + '"><a:tbl>' +
      '<a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>' + TABLE_STYLE + '</a:tableStyleId></a:tblPr>' +
      '<a:tblGrid>' + colWs.map((w) => '<a:gridCol w="' + w + '"/>').join("") + '</a:tblGrid>' + rows +
      '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }

  /** Picture shape referencing a media part via r:embed rid. */
  function spPic(id, rid, x, y, cx, cy) {
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="Picture ' + id + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }

  /** A full <p:sld> from its shapes. */
  function slideXml(shapes) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sld ' + A_NS + " " + R_NS + " " + P_NS + "><p:cSld><p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes +
      "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
  }

  /* the standard table style definition the table slides reference */
  const TBL_STYLE_XML = (() => {
    const ln = (c) => '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="' + c + '"/></a:solidFill></a:ln>';
    const bdr = (c, inside) => "<a:tcBdr><a:top>" + ln(c) + "</a:top><a:left>" + ln(c) + "</a:left><a:bottom>" + ln(c) + "</a:bottom><a:right>" + ln(c) + "</a:right>" +
      (inside ? "<a:insideH>" + ln(c) + "</a:insideH><a:insideV>" + ln(c) + "</a:insideV>" : "") + "</a:tcBdr>";
    const part = (name, bold, txtColor, bdrColor, inside) =>
      "<a:" + name + ">" +
      (txtColor ? '<a:tcTxStyle' + (bold ? ' b="on"' : "") + "><a:fontRef idx=\"minor\"><a:schemeClr val=\"" + txtColor + "\"/></a:fontRef></a:tcTxStyle>" : "") +
      bdr(bdrColor, inside) +
      // marL/marR/marT/marB are ATTRIBUTES of a:tcTxPr. Written as elements
      // ("<a:marL=...") the theme was invalid XML, so EVERY exported .pptx
      // failed to open no matter what the source PDF contained.
      '<a:tcTxPr marL="45720" marR="45720" marT="3600" marB="3600"/>' +
      "</a:" + name + ">";
    return '<a:tblStyleLst def="' + TABLE_STYLE + '">' +
      '<a:tblStyle styleId="' + TABLE_STYLE + '" styleName="Medium Style 2 - Accent 1">' +
      '<a:tblBg><a:fill><a:wholeTbl><a:solidFill><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:solidFill></a:wholeTbl></a:fill></a:tblBg>' +
      part("wholeTbl", false, "lt1", "lt1", true) +
      part("firstRow", true, "lt1", "accent1", false) +
      part("band1H", false, "accent1", "accent1", false) +
      "</a:tblStyle></a:tblStyleLst>";
  })();

  function themeXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Volt">' +
      "<a:themeElements>" +
      '<a:clrScheme name="Volt">' +
      '<a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="EEF1F6"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="7C6CFF"/></a:accent1><a:accent2><a:srgbClr val="4CC9F0"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="34D399"/></a:accent3><a:accent4><a:srgbClr val="F59E0B"/></a:accent4>' +
      '<a:accent5><a:srgbClr val="EF4444"/></a:accent5><a:accent6><a:srgbClr val="8B5CF6"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="3B82F6"/></a:hlink><a:folHlink><a:srgbClr val="9333EA"/></a:folHlink>' +
      "</a:clrScheme>" +
      '<a:fontScheme name="Volt">' +
      '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
      "</a:fontScheme>" +
      '<a:fmtScheme name="Volt">' +
      '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst>' +
      '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
      '<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
      '<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
      "</a:lnStyleLst>" +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
      "</a:fmtScheme>" +
      "</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/>" +
      TBL_STYLE_XML +
      "</a:theme>";
  }

  function masterXml() {
    const lvls = (szs, extra) => szs.map((sz, i) =>
      '<a:lvl' + (i + 1) + 'pPr><a:defRPr sz="' + sz + '"' + extra + "/></a:lvl" + (i + 1) + 'pPr>').join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sldMaster ' + A_NS + " " + R_NS + " " + P_NS + "><p:cSld>" +
      '<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      "<p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      "</p:spTree></p:cSld>" +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      "<p:txStyles>" +
      '<p:titleStyle>' + lvls([4400, 3600, 3200, 2800, 2400, 2200, 2000, 1800, 1600], ' b="1" kern="1200"') + "</p:titleStyle>" +
      '<p:bodyStyle>' + lvls([1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000], "") + "</p:bodyStyle>" +
      '<p:otherStyle>' + lvls([1800, 1700, 1600, 1500, 1400, 1300, 1200, 1100, 1000], "") + "</p:otherStyle>" +
      "</p:txStyles></p:sldMaster>";
  }

  function layoutXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sldLayout ' + A_NS + " " + R_NS + " " + P_NS + ' type="blank"><p:cSld name="Blank">' +
      "<p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      "</p:spTree></p:cSld>" +
      "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";
  }

  function relsXml(entries) {
    return RELS_ROOT + entries.map((e) =>
      '<Relationship Id="' + e.rid + '" Type="' + e.type + '" Target="' + e.target + '"/>'
    ).join("") + "</Relationships>";
  }

  /** The page's prose, split into slide-sized chunks (long paragraphs are
      re-wrapped on spaces so nothing is dropped). */
  function pageProseSlides(page) {
    const flat = [];
    for (const p of page.paragraphs || []) {
      const t = String(p.text || "").trim();
      if (!t) continue;
      if (t.length <= 900) { flat.push(t); continue; }
      const words = t.split(/\s+/);
      let cur = "";
      for (const w of words) {
        if ((cur + " " + w).trim().length <= 900) cur = (cur + " " + w).trim();
        else { if (cur) flat.push(cur); cur = w; }
      }
      if (cur) flat.push(cur);
    }
    const perSlide = 10, out = [];
    for (let i = 0; i < flat.length; i += perSlide) {
      out.push({ title: "Page " + page.num + (out.length ? " (cont.)" : ""), paras: flat.slice(i, i + perSlide) });
    }
    if (!out.length) out.push({ title: "Page " + page.num, paras: [] });
    return out;
  }

  /** Build a .pptx from a collected document (same shape as OE.docx's
      input: { title, pages: [{ num, paragraphs, tables, images }] }).
      Deck layout: title slide, then per page — prose slides, one slide
      per detected table (chunked when it exceeds the slide height), one
      slide per image. Returns a Uint8Array. */
  OE.pptx = function (doc) {
    const slides = [];      // slide XML strings
    const slideRels = [];   // per-slide extra relationships (images)
    const media = [];       // { file, bytes, mime }
    const ACCENT = "7C6CFF";

    // title slide
    slides.push(slideXml(
      spTextBox(2, M, 2500000, CW, 900000, [{ text: doc.title || "Document", sz: 4000, b: true }], false) +
      spTextBox(3, M, 3500000, CW, 700000, [{
        text: "Exported from Volt · " + doc.pages.length + " page" + (doc.pages.length === 1 ? "" : "s"),
        sz: 1800, color: "6B7280",
      }], false)
    ));
    slideRels.push([]);

    for (const pg of doc.pages) {
      // prose slides
      for (const ps of pageProseSlides(pg)) {
        const shapes =
          spTextBox(2, M, 400000, CW, 700000, [{ text: ps.title, sz: 2600, b: true, color: ACCENT }], false) +
          spTextBox(3, M, 1300000, CW, 5000000,
            ps.paras.map((p) => ({ text: p, sz: 1600, spaceAfter: 600 })), true);
        slides.push(slideXml(shapes));
        slideRels.push([]);
      }
      // table slides (chunked at 13 rows so the grid fits the slide)
      for (const grid of pg.tables || []) {
        const ROW_H = 400000, MAX_ROWS = 13;
        for (let i = 0; i < grid.length; i += MAX_ROWS) {
          const chunk = grid.slice(i, i + MAX_ROWS);
          const parts = i > 0 ? " (part " + (Math.floor(i / MAX_ROWS) + 1) + ")" : "";
          const shapes =
            spTextBox(2, M, 350000, CW, 600000, [{ text: "Table · page " + pg.num + parts, sz: 2400, b: true, color: ACCENT }], false) +
            spTable(3, M, 1150000, chunk, ROW_H);
          slides.push(slideXml(shapes));
          slideRels.push([]);
        }
      }
      // image slides — one picture per slide, centered, aspect preserved
      for (const img of pg.images || []) {
        const file = "media/image" + (media.length + 1) + "." + (img.mime === "image/jpeg" ? "jpeg" : "png");
        media.push({ file, bytes: img.bytes, mime: img.mime });
        const maxW = 9500000, maxH = 4800000;
        let w = Math.round(img.wPts * 12700), h = Math.round(img.hPts * 12700);
        const scale = Math.min(1, maxW / w, maxH / h);
        w = Math.round(w * scale); h = Math.round(h * scale);
        const x = Math.round((EMU_W - w) / 2), y = 1300000 + Math.round((maxH - h) / 2);
        const shapes =
          spTextBox(2, M, 350000, CW, 600000, [{ text: "Image · page " + pg.num, sz: 2400, b: true, color: ACCENT }], false) +
          spPic(3, "rId2", x, y, w, h);
        slides.push(slideXml(shapes));
        slideRels.push([{ rid: "rId2", type: PPT_REL + "/image", target: "../" + file }]);
      }
    }

    // ── package parts ──
    const slideOverrides = slides.map((_s, i) =>
      '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
    ).join("");
    const ctXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      slideOverrides +
      "</Types>";
    const coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + OE.xml(doc.title || "Volt export") + "</dc:title>" +
      "<dc:creator>Volt</dc:creator></cp:coreProperties>";
    const appXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      "<Application>Volt</Application><Slides>" + slides.length + "</Slides></Properties>";
    const presXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:presentation ' + A_NS + " " + R_NS + " " + P_NS + ">" +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      "<p:sldIdLst>" + slides.map((_s, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join("") + "</p:sldIdLst>" +
      '<p:sldSz cx="' + EMU_W + '" cy="' + EMU_H + '"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      "</p:presentation>";
    const presRels = relsXml([
      { rid: "rId1", type: PPT_REL + "/slideMaster", target: "slideMasters/slideMaster1.xml" },
      ...slides.map((_s, i) => ({ rid: "rId" + (i + 2), type: PPT_REL + "/slide", target: "slides/slide" + (i + 1) + ".xml" })),
    ]);

    const files = [
      { name: "[Content_Types].xml", bytes: OE.utf8(ctXml) },
      { name: "_rels/.rels", bytes: OE.utf8(relsXml([
        { rid: "rId1", type: PPT_REL + "/officeDocument", target: "ppt/presentation.xml" },
        { rid: "rId2", type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", target: "docProps/core.xml" },
        { rid: "rId3", type: PPT_REL + "/extended-properties", target: "docProps/app.xml" },
      ])) },
      { name: "docProps/core.xml", bytes: OE.utf8(coreXml) },
      { name: "docProps/app.xml", bytes: OE.utf8(appXml) },
      { name: "ppt/presentation.xml", bytes: OE.utf8(presXml) },
      { name: "ppt/_rels/presentation.xml.rels", bytes: OE.utf8(presRels) },
      { name: "ppt/slideMasters/slideMaster1.xml", bytes: OE.utf8(masterXml()) },
      { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", bytes: OE.utf8(relsXml([
        { rid: "rId1", type: PPT_REL + "/slideLayout", target: "../slideLayouts/slideLayout1.xml" },
        { rid: "rId2", type: PPT_REL + "/theme", target: "../theme/theme1.xml" },
      ])) },
      { name: "ppt/slideLayouts/slideLayout1.xml", bytes: OE.utf8(layoutXml()) },
      { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", bytes: OE.utf8(relsXml([
        { rid: "rId1", type: PPT_REL + "/slideMaster", target: "../slideMasters/slideMaster1.xml" },
      ])) },
      { name: "ppt/theme/theme1.xml", bytes: OE.utf8(themeXml()) },
    ];
    slides.forEach((s, i) => {
      files.push({ name: "ppt/slides/slide" + (i + 1) + ".xml", bytes: OE.utf8(s) });
      files.push({ name: "ppt/slides/_rels/slide" + (i + 1) + ".xml.rels", bytes: OE.utf8(relsXml([
        { rid: "rId1", type: PPT_REL + "/slideLayout", target: "../slideLayouts/slideLayout1.xml" },
        ...slideRels[i],
      ])) });
    });
    for (const m of media) files.push({ name: "ppt/" + m.file, bytes: m.bytes });
    const out = OE.zip(files);
    // the REAL slide count (prose slides chunk when a page's text is long, so
    // it can exceed 1 + pages.length) — the smoke asserts the written deck
    // contains exactly this many slides
    out.slideCount = slides.length;
    return out;
  };

  OE.utf8 = function (s) { return new TextEncoder().encode(s); };

  /* ── TSV (paste-ready for Google Sheets / Excel) ────────────── */
  OE.tsv = function (grid) {
    return grid.map((row) => row.map((c) => {
      const t = String(c == null ? "" : c);
      return /[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join("\t")).join("\n");
  };

  /* ── line grouping (pure): textContent items → lines ────────── */
  /** Cluster text items into lines by baseline (transform[5], y-up PDF
      space). items: [{ str, transform }] or [{ str, y }]. Returns lines
      [{ y, text, tokens: [{ x, x2, text }] }] sorted top→bottom. */
  OE.groupLines = function (items, tolerance) {
    const tol = tolerance == null ? 2.5 : tolerance;
    const rows = [];
    for (const it of items || []) {
      const s = String(it.str || "");
      if (!s.trim()) continue;
      const y = it.y != null ? it.y : (it.transform && it.transform[5]);
      const x = it.x != null ? it.x : (it.transform && it.transform[4]);
      const w = it.w != null ? it.w : (it.width || s.length * 2);
      // the line's height (font size from the text transform) lets the
      // vector-grid detector anchor text to the right row band by its middle
      const h = it.h != null ? it.h : (it.transform && Math.abs(it.transform[3])) || it.height || 0;
      if (y == null || x == null) continue;
      let row = null;
      for (const r of rows) if (Math.abs(r.y - y) <= tol) { row = r; break; }
      if (!row) { row = { y, h: 0, tokens: [] }; rows.push(row); }
      row.tokens.push({ x, x2: x + w, text: s, f: it.fontName || null });
      if (h > row.h) row.h = h;
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => {
      r.tokens.sort((a, b) => a.x - b.x);
      r.text = r.tokens.map((t) => t.text).join(" ");
      return r;
    });
  };

  /** Split a line's tokens into column clusters: tokens stay together while
      the gap to the next is small (a word space); a real gap starts a new
      column. Shared by the text-gap detector (detectTables) and the
      vector-grid assignment (gridTables), so a column's width means the same
      thing in both. Returns [{ x, x2, text }] — each cluster's span + text. */
  OE.lineClusters = function (line, gapThreshold) {
    const gap = gapThreshold == null ? 12 : gapThreshold;
    const out = [];
    const toks = (line && line.tokens) || [];
    if (!toks.length) return out;
    let cur = [toks[0]];
    for (let i = 1; i < toks.length; i++) {
      if (toks[i].x - toks[i - 1].x2 > gap) { out.push(cur); cur = []; }
      cur.push(toks[i]);
    }
    out.push(cur);
    return out.map((c) => ({
      x: c[0].x,
      x2: c[c.length - 1].x2,
      text: c.map((t) => t.text).join(" "),
    }));
  };

  /* ── table detection (pure heuristic) ───────────────────────── */
  /** Detect column-aligned tables among lines. Accepts EITHER grouped
      lines (from OE.groupLines — objects with .tokens) or raw items
      (grouped internally). A line is tabular when its tokens split into
      >= 2 columns on real gaps (spaces between words don't count);
      a table is a run of >= minRows consecutive tabular lines. Returns
      { tables: [[[cell]]], lineIndexes: Set<line index> }. */
  /** Is this candidate actually a two-column ARTICLE?

      The gap detector finds a table wherever text sits in aligned columns
      with a real gap between them — which is exactly what a two-column page
      of prose looks like. It claimed those pages, so the column ordering
      never saw them and a two-column article exported as a two-column table
      with a sentence in every cell.

      Prose and tabular data separate cleanly on cell length. Table cells are
      short: a label, a number, a date. Prose cells are lines of running text
      that fill their column. Requiring BOTH columns to be long-form, and the
      run to be tall, keeps genuinely long two-column tables of short values
      safe — and a table with even one short column is still read as a table.
      Only applies to gap-detected candidates: a table drawn with ruling lines
      has evidence of its own and is never second-guessed. */
  function looksLikeProse(grid) {
    if (!grid || grid.length < 6) return false;      // too short to tell
    const cols = grid[0].length;
    if (cols !== 2) return false;                    // 3+ columns is not an article
    const medianLen = (ci) => {
      const lens = grid.map((r) => String(r[ci] || "").trim().length).filter((n) => n > 0).sort((a2, b2) => a2 - b2);
      return lens.length ? lens[Math.floor(lens.length / 2)] : 0;
    };
    const PROSE_CHARS = 25;
    if (medianLen(0) < PROSE_CHARS || medianLen(1) < PROSE_CHARS) return false;
    // running text carries sentence punctuation and spaces; a column of long
    // identifiers or paths does not
    const wordy = (ci) => grid.filter((r) => (String(r[ci] || "").match(/ /g) || []).length >= 3).length;
    return wordy(0) >= grid.length * 0.7 && wordy(1) >= grid.length * 0.7;
  }

  OE.detectTables = function (linesOrItems, opts) {
    const o = opts || {};
    const minRows = o.minRows || 3;
    const gapThreshold = o.gapThreshold || 12;
    const lines = linesOrItems && linesOrItems[0] && linesOrItems[0].tokens
      ? linesOrItems
      : OE.groupLines(linesOrItems);
    const split = (line) => {
      if (!line.tokens || line.tokens.length < 2) return [line.text];
      return OE.lineClusters(line, gapThreshold).map((c) => c.text);
    };
    const isTabular = (line) => split(line).length >= 2;
    const tables = [];
    const lineIndexes = new Set();
    let i = 0;
    while (i < lines.length) {
      if (!isTabular(lines[i])) { i++; continue; }
      const run = [i];
      while (i + 1 < lines.length && isTabular(lines[i + 1])) { i++; run.push(i); }
      if (run.length >= minRows) {
        const grid = run.map((li) => split(lines[li]));
        const maxCols = Math.max(...grid.map((g) => g.length));
        const padded = grid.map((g) => {
          while (g.length < maxCols) g.push("");
          return g;
        });
        // a two-column ARTICLE is not a two-column table — see looksLikeProse
        if (!looksLikeProse(padded)) {
          tables.push(padded);
          run.forEach((li) => lineIndexes.add(li));
        }
      }
      i++;
    }
    return { tables, lineIndexes };
  };

  /* ── vector grid detection (drawn gridlines, merged cells) ────
     Text-gap detection can't see a table drawn with lines but little or no
     text (blank forms), and it splits columns by text gaps, which misaligns
     merged cells. This reads the page's vector operators instead: pdf.js v4
     emits paths as OPS.constructPath (op 91 — packed [ops, coords, bbox])
     whose coordinates are in the LOCAL space of the current CTM (the cm
     transforms precede it), so the CTM is tracked and applied. Axis-aligned
     segments from STROKED paths are clustered into edge positions, connected
     edges (they must cross) form table components, and text is then assigned
     to cells by position — a wide merged-cell line flattens to its first
     column with empty neighbors, and an empty grid stays an empty grid. */
  const OPS_CM = 12, OPS_CONSTRUCT_PATH = 91, OPS_SAVE = 10, OPS_RESTORE = 11,
    OPS_STROKE = 20, OPS_CLOSESTROKE = 21,
    OPS_FILL = 22, OPS_EOFILL = 23, OPS_FILLSTROKE = 24, OPS_EOFILLSTROKE = 25, OPS_ENDPATH = 28,
    OPS_MOVETO = 13, OPS_LINETO = 14, OPS_CURVE = 15, OPS_CLOSEPATH = 18, OPS_RECT = 19;

  /** affine 2D matrix helpers (pdf.js operator-list space): matMul(a, b) is
      a·b — a applied to the result of b (content streams compose cm ops so
      later ops multiply on the left). */
  function matMul(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }
  function matPt(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  /** Axis-aligned segments from one constructPath payload (page space). */
  function pathSegments(pathOps, coords, ctm) {
    const segs = [];
    let k = 0, sub = null, last = null;
    for (const op of pathOps || []) {
      if (op === OPS_MOVETO || op === OPS_LINETO) {
        const [x, y] = matPt(ctm, coords[k], coords[k + 1]); k += 2;
        if (op === OPS_MOVETO) { sub = [x, y]; last = [x, y]; }
        else if (last) { segs.push([last[0], last[1], x, y]); last = [x, y]; }
      } else if (op === OPS_CLOSEPATH) {
        if (last && sub) { segs.push([last[0], last[1], sub[0], sub[1]]); last = sub; }
      } else if (op === OPS_RECT) {
        const x = coords[k], y = coords[k + 1], w = coords[k + 2], h = coords[k + 3]; k += 4;
        const [x0, y0] = matPt(ctm, x, y);
        const [x1, y1] = matPt(ctm, x + w, y + h);
        segs.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
      } else if (op >= OPS_CURVE && op <= OPS_CURVE + 2) { k += 6; sub = null; last = null; } // curves can't be grid lines
    }
    return segs;
  }

  /** Cluster segments into edge positions: segments whose key coordinate
      (y for horizontals, x for verticals) is within `tol` merge into one
      edge, remembering the merged span (lo..hi) of the perpendicular axis.
      Segments are only merged when their perpendicular spans OVERLAP or
      nearly touch (`gapTol`) — two same-x verticals separated by a real gap
      belong to different tables (a grid above a merged table share their
      column x positions but must stay separate), while adjacent cells of one
      grid always share a boundary line. */
  function clusterEdges(segs, key, lo, hi, tol, gapTol) {
    const gap = gapTol == null ? tol : gapTol;
    const sorted = segs.slice().sort((a, b) => a[key] - b[key]);
    const groups = [];
    for (const s of sorted) {
      let g = null;
      for (const c of groups) {
        const sameKey = Math.abs(c.key - s[key]) <= tol;
        const touching = s[lo] <= c.hi + gap && s[hi] >= c.lo - gap;
        if (sameKey && touching) { g = c; break; }
      }
      if (!g) { g = { key: s[key], lo: Infinity, hi: -Infinity }; groups.push(g); }
      g.lo = Math.min(g.lo, s[lo]); g.hi = Math.max(g.hi, s[hi]);
    }
    return groups;
  }

  /** Build table grids from an operator list — PURE (unit-tested).
      ops: { fnArray, argsArray } from page.getOperatorList(). Returns
      [{ yEdges (top→bottom), xEdges (left→right) }]; a grid's cells are the
      rectangles between consecutive edges. */
  OE.linesToGrids = function (ops, opts) {
    const o = opts || {};
    const TOL = o.tol != null ? o.tol : 2;
    const MIN_ROWS = o.minRows != null ? o.minRows : 2;
    const MIN_COLS = o.minCols != null ? o.minCols : 2;
    const fnArray = ops && ops.fnArray, argsArray = ops && ops.argsArray;
    if (!Array.isArray(fnArray)) return [];
    const hSegs = [], vSegs = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const ctmStack = []; // producers wrap each drawing call in q/Q — the CTM resets between them
    let pending = null; // current path's segments — committed only when STROKED
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i], a = argsArray[i] || [];
      if (fn === OPS_CM) ctm = matMul(a, ctm);
      else if (fn === OPS_SAVE) ctmStack.push(ctm.slice());
      else if (fn === OPS_RESTORE) ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS_CONSTRUCT_PATH) pending = pathSegments(a[0], a[1], ctm);
      else if (fn >= OPS_STROKE && fn <= OPS_EOFILLSTROKE) {
        // fills don't make grid lines (they're backgrounds/banding) — only a
        // stroked path contributes edges
        if (pending && (fn === OPS_STROKE || fn === OPS_CLOSESTROKE)) {
          for (const s of pending) {
            const x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3];
            if (Math.abs(y1 - y2) <= 0.5 && Math.abs(x1 - x2) > 2) hSegs.push({ y: y1, x0: Math.min(x1, x2), x1: Math.max(x1, x2) });
            else if (Math.abs(x1 - x2) <= 0.5 && Math.abs(y1 - y2) > 2) vSegs.push({ x: x1, y0: Math.min(y1, y2), y1: Math.max(y1, y2) });
          }
        }
        pending = null;
      }
      else if (fn === OPS_ENDPATH) pending = null;
    }

    const hs = clusterEdges(hSegs, "y", "x0", "x1", TOL);
    const vs = clusterEdges(vSegs, "x", "y0", "y1", TOL);
    // connected components: an H edge and a V edge belong to one table when
    // they actually CROSS (their spans overlap) — separate tables stay apart
    const parent = Array.from({ length: hs.length + vs.length }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (let hi = 0; hi < hs.length; hi++) for (let vi = 0; vi < vs.length; vi++) {
      const h = hs[hi], v = vs[vi];
      if (v.lo - TOL <= h.key && h.key <= v.hi + TOL && h.lo - TOL <= v.key && v.key <= h.hi + TOL) union(hi, hs.length + vi);
    }
    const comps = new Map();
    for (let hi = 0; hi < hs.length; hi++) {
      const r = find(hi); if (!comps.has(r)) comps.set(r, { hs: [], vs: [] });
      comps.get(r).hs.push(hs[hi]);
    }
    for (let vi = 0; vi < vs.length; vi++) {
      const r = find(hs.length + vi); if (!comps.has(r)) comps.set(r, { hs: [], vs: [] });
      comps.get(r).vs.push(vs[vi]);
    }
    const grids = [];
    for (const c of comps.values()) {
      if (c.hs.length < MIN_ROWS + 1 || c.vs.length < MIN_COLS + 1) continue;
      // a dense rule grid is usually a chart, not a table — cap the size
      if (c.hs.length - 1 > 15 || c.vs.length - 1 > 15) continue;
      c.hs.sort((a, b) => b.key - a.key); // top → bottom
      c.vs.sort((a, b) => a.key - b.key); // left → right
      grids.push({ yEdges: c.hs.map((g) => g.key), xEdges: c.vs.map((g) => g.key) });
    }
    return grids;
  };

  /** Assign grouped text lines onto vector grids — PURE. Merged cells flatten
      to their first column (the neighbors stay empty), blank rows/cols stay
      blank, and lines outside a grid's extent are left for the text-gap
      detector (or prose). A grid with NO text at all is kept only when small
      — a dense empty rule grid is usually a chart, not a form. */
  OE.gridTables = function (lines, grids) {
    const tables = [], lineIndexes = new Set();
    for (const g of grids) {
      const rows = g.yEdges.length - 1, cols = g.xEdges.length - 1;
      if (rows < 1 || cols < 1) continue;
      const grid = Array.from({ length: rows }, () => Array(cols).fill(""));
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        // anchor the line to a row by its VERTICAL MIDDLE — a baseline sits at
        // the bottom of its band, so the bare y would drop into the next row
        const mid = (line.y || 0) + ((line.h || 0) / 2);
        let row = -1;
        for (let r = 0; r < rows; r++) if (mid <= g.yEdges[r] + 0.5 && mid > g.yEdges[r + 1] - 0.5) { row = r; break; }
        if (row < 0) continue;
        for (const cl of OE.lineClusters(line)) {
          const cx = (cl.x + cl.x2) / 2;
          let col = -1;
          for (let c = 0; c < cols; c++) if (cx >= g.xEdges[c] - 0.5 && cx < g.xEdges[c + 1] + 0.5) { col = c; break; }
          if (col < 0) continue;
          grid[row][col] = (grid[row][col] ? grid[row][col] + " " : "") + cl.text;
        }
        lineIndexes.add(li);
      }
      const hasText = grid.some((r) => r.some((c) => String(c || "").trim()));
      if (!hasText && rows * cols > 60) continue;
      tables.push(grid);
    }
    return { tables, lineIndexes };
  };

  /** Vector-grid detection (browser only — needs pdf.js operator list). */
  OE.detectGrids = async function (page) {
    try {
      const ops = await page.getOperatorList();
      return OE.linesToGrids(ops);
    } catch (e) { return []; }
  };

  /* ── image extraction (pdf.js, browser only) ────────────────── */
  const OPS_PAINT_IMAGE = 85;       // paintImageXObject
  const OPS_PAINT_INLINE = 86;      // paintInlineImageXObject

  /** Re-encode an image object to embeddable bytes: pdf.js v4 decodes
      images to ImageBitmap when the page renders (the common path here —
      collect() runs on the rendered document), which we draw to a PNG;
      already-encoded JPEG/PNG data passes through untouched; raw pixels
      are re-encoded through a canvas. Returns { bytes, mime } or null. */
  OE.encodeImage = function (obj, w, h) {
    const data = obj && obj.data;
    if (data && data.length) {
      if (data[0] === 0xff && data[1] === 0xd8) return { bytes: data, mime: "image/jpeg" };
      if (data[0] === 0x89 && data[1] === 0x50) return { bytes: data, mime: "image/png" };
    }
    if (obj && obj.bitmap) {
      try {
        const bmp = obj.bitmap;
        const bw = bmp.width || w || 100, bh = bmp.height || h || 100;
        const canvas = document.createElement("canvas");
        canvas.width = bw; canvas.height = bh;
        canvas.getContext("2d").drawImage(bmp, 0, 0);
        const url = canvas.toDataURL("image/png");
        const bin = atob(url.split(",")[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return { bytes, mime: "image/png" };
      } catch (e) { /* fall through to the raw-pixel path */ }
    }
    const pw = obj && obj.width, ph = obj && obj.height;
    if (!data || !data.length || !pw || !ph) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = pw; canvas.height = ph;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(pw, ph);
      const n = obj.n || 3;
      const bpc = obj.bpc || 8;
      if (bpc !== 8) return null; // 1/2/4-bit sources are rare — skip
      const dst = img.data;
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const si = (y * pw + x) * n;
          const di = (y * pw + x) * 4;
          const r = n >= 1 ? data[si] : 0;
          dst[di] = r;
          dst[di + 1] = n >= 2 ? data[si + 1] : r;
          dst[di + 2] = n >= 3 ? data[si + 2] : r;
          dst[di + 3] = n >= 4 ? data[si + 3] : 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const url = canvas.toDataURL("image/png");
      const b64 = url.split(",")[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime: "image/png" };
    } catch (e) {
      return null;
    }
  };

  /** Extract the page's images (deduped) as embeddable bytes +
      document-friendly size. Returns [{ bytes, mime, wPts, hPts }].
      givenOps: optional pre-fetched operator list (collect() reads it once
      for the vector grids and reuses it here). */
  OE.detectImages = async function (page, givenOps) {
    const ops = givenOps || await page.getOperatorList();
    const out = [];
    const seen = new Set();
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn !== OPS_PAINT_IMAGE && fn !== OPS_PAINT_INLINE) continue;
      try {
        const args = ops.argsArray[i] || [];
        let obj = null;
        if (fn === OPS_PAINT_IMAGE) {
          try {
            obj = await page.objs.get(args[0]);
          } catch (e) { obj = null; }
        } else if (args[1]) {
          const d = args[0];
          obj = { data: args[1], width: d && d.W, height: d && d.H, n: d && d.N, bpc: d && d.BPC };
        }
        if (!obj) continue;
        // args can carry the painted size ([name, width, height]) — helpful
        // when the object itself is sparse (unresolved/decoded-on-render)
        const wPx = obj.width || args[1] || 100;
        const hPx = obj.height || args[2] || 100;
        // the XObject name (args[0]) makes the dedupe key unique per image;
        // repeated paints of the same object then collapse to one figure
        const key = (args[0] || "") + ":" + wPx + "x" + hPx;
        if (seen.has(key)) continue;
        seen.add(key);
        const enc = OE.encodeImage(obj, wPx, hPx);
        if (!enc) continue;
        const wPts = Math.max(72, Math.min(432, Math.round(wPx * 72 / 96)));
        const hPts = Math.max(36, Math.round(wPts * hPx / wPx));
        out.push({ bytes: enc.bytes, mime: enc.mime, wPts, hPts });
      } catch (e) { /* a broken image must never break the export */ }
    }
    return out;
  };

  /* ── document collection (browser only, needs pdf.js + Volt) ── */
  function applyTextEdits(lines, pageEdits) {
    for (const e of pageEdits || []) {
      const want = String(e.original || "").replace(/\s+/g, " ").trim();
      if (!want) continue;
      const line = lines.find((l) => l.text && l.text.toLowerCase().includes(want.toLowerCase()));
      if (line) line.text = String(e.text || e.original || "").replace(/\s+/g, " ").trim();
    }
  }

  /** The tables of one page, combining the vector-grid detector (drawn
      gridlines — also sees blank forms and merged cells) with the text-gap
      heuristic (column-aligned text). Lines claimed by a drawn grid are
      excluded from the text-gap pass so a table is never counted twice, and
      the claimed line indexes let callers keep prose clean. PURE except for
      the operator-list fetch. */
  async function pageTables(page, edits) {
    const ops = await page.getOperatorList();
    const tc = await page.getTextContent();
    const items = (tc.items || []).filter((i) => i.str && i.str.trim());
    const lines = OE.groupLines(items);
    applyTextEdits(lines, edits);
    const grids = OE.linesToGrids(ops);
    const gridDet = grids.length ? OE.gridTables(lines, grids) : { tables: [], lineIndexes: new Set() };
    // text-gap pass over only the lines the grids didn't claim
    const remaining = [], remap = [];
    lines.forEach((l, i) => { if (!gridDet.lineIndexes.has(i)) { remap.push(i); remaining.push(l); } });
    const textDet = OE.detectTables(remaining);
    const lineIndexes = new Set(gridDet.lineIndexes);
    textDet.lineIndexes.forEach((ri) => lineIndexes.add(remap[ri]));
    return { lines, tables: [...gridDet.tables, ...textDet.tables], lineIndexes, ops };
  }

  /** Gather the open document's text (with text-edit annotations applied),
      detected tables, and images — the input for docx()/pptx().
      pages: optional array of 1-based page numbers; when given, ONLY those
      pages are collected (in the given order — the Pages manager's selection
      is passed here). Page numbers on the results stay the ACTUAL page
      numbers, so "Page 3" labels and table page tags remain correct. */
  /* ── layout geometry ────────────────────────────────────────
     A Word export that reflows the text into Letter-sized pages at Word's
     default 11pt does not preserve much: a dense A4 report set in 8pt came
     out at exactly twice its page count, because every line took half again
     the height it had and the page it was flowing onto was the wrong shape.
     Carrying three numbers per line — its point size, the leading to the next
     line, and the page it sits on — is most of the way to a page that holds
     what it held. */

  /* ── columns ─────────────────────────────────────────────────
     Lines are grouped by their Y position across the FULL page width, which
     is right for a single column and wrong for two: a line of the left column
     and the line beside it in the right column share a Y, so they are joined
     into one line and the exported text reads
     "The survey concluded that   Appendix B lists the raw" — both columns
     interleaved, sentence by sentence, unreadable.

     Finding the gutter is enough to fix it. A real gutter is a vertical band
     that no token crosses, wide enough not to be a word space, running down
     most of the page. Split the tokens at it, regroup each side on its own,
     and emit the bands left to right — which is the order they are read in. */

  /** Vertical bands of a page separated by gutters no token crosses.
      Returns [{x1,x2}] in reading order, or a single full-width band when the
      page is one column — which is the common case and must cost nothing. */
  OE.detectColumns = function (lines, pageW) {
    const toks = [];
    for (const l of lines || []) for (const tk of l.tokens || []) toks.push(tk);
    // too few tokens to tell a gutter from a coincidence — a title page with
    // three centred lines has empty bands everywhere and no columns at all
    if (toks.length < 6) return [{ x1: 0, x2: pageW || 1e6 }];
    let minX = Infinity, maxX = -Infinity;
    for (const tk of toks) { if (tk.x < minX) minX = tk.x; if (tk.x2 > maxX) maxX = tk.x2; }
    const span = maxX - minX;
    if (!(span > 40)) return [{ x1: 0, x2: pageW || 1e6 }];

    // occupancy over the text span, 2pt buckets
    const BUCKET = 2;
    const n = Math.ceil(span / BUCKET) + 1;
    const hit = new Uint32Array(n);
    for (const tk of toks) {
      const a = Math.max(0, Math.floor((tk.x - minX) / BUCKET));
      const b = Math.min(n - 1, Math.ceil((tk.x2 - minX) / BUCKET));
      for (let i = a; i <= b; i++) hit[i]++;
    }
    // a gutter must be wider than a word space and sit inside the text, never
    // at its edges — a wide left indent is not a column boundary
    const MIN_GUTTER = 14;                       // points
    const edge = Math.max(2, Math.round(span * 0.12 / BUCKET));
    const gutters = [];
    let run = 0;
    for (let i = 0; i <= n; i++) {
      const empty = i < n && hit[i] === 0;
      if (empty) { run++; continue; }
      if (run * BUCKET >= MIN_GUTTER) {
        const gs = i - run, ge = i - 1;
        if (gs > edge && ge < n - edge) gutters.push({ a: gs, b: ge });
      }
      run = 0;
    }
    if (!gutters.length) return [{ x1: 0, x2: pageW || 1e6 }];

    // bands, then keep only a split where BOTH sides carry real text — a
    // marginal note or a page number must not become a column
    const cuts = gutters.map((g) => minX + ((g.a + g.b) / 2) * BUCKET);
    const edges = [minX - 1, ...cuts, maxX + 1];
    const bands = [];
    for (let i = 0; i < edges.length - 1; i++) bands.push({ x1: edges[i], x2: edges[i + 1] });
    const counts = bands.map((bd) => toks.filter((tk) => tk.x >= bd.x1 && tk.x < bd.x2).length);
    const total = toks.length;
    const keep = bands.filter((bd, i) => counts[i] / total >= 0.15);
    return keep.length > 1 ? keep : [{ x1: 0, x2: pageW || 1e6 }];
  };

  /** Re-read a page's lines column by column. With one column the input is
      returned untouched, so a single-column document pays nothing. */
  OE.orderByColumns = function (lines, pageW) {
    const bands = OE.detectColumns(lines, pageW);
    if (bands.length < 2) return lines;
    const out = [];
    for (const bd of bands) {
      const rows = [];
      for (const l of lines) {
        const inBand = (l.tokens || []).filter((tk) => tk.x >= bd.x1 && tk.x < bd.x2);
        if (!inBand.length) continue;
        rows.push({
          y: l.y, h: l.h, tokens: inBand,
          text: inBand.map((tk) => tk.text).join(" "),
        });
      }
      rows.sort((a, b) => b.y - a.y);
      out.push(...rows);
    }
    return out;
  };

  /* ── fonts ───────────────────────────────────────────────────
     Every exported line came out in Word's default sans-serif, so a document
     set in a serif face changed character completely and, because the metrics
     differ, changed length too. The embedded font's own name is the best
     evidence available: PDF font names carry their family and their weight,
     and mapping them onto the three faces every Word install has is both
     reliable and enough. Matching the exact face would need the font
     embedded, which is a different and much larger job. */

  /** A PDF font name mapped onto a face Word is certain to have, plus the
      weight and slant the name declares. */
  OE.mapFont = function (name) {
    const n = String(name || "");
    const lower = n.toLowerCase();
    const bold = /bold|black|heavy|semib|demi/.test(lower);
    const italic = /italic|oblique/.test(lower);
    let family = "Arial";
    if (/courier|mono|consol/.test(lower)) family = "Courier New";
    else if (/times|serif|georgia|garamond|book|roman|minion|cambria|palatino/.test(lower) &&
             !/sans/.test(lower)) family = "Times New Roman";
    return { family, bold, italic };
  };

  /** Resolve a page's font ids to their real names. pdf.js hands text items an
      internal id ("g_d0_f1"); the name lives in commonObjs once the operator
      list has been walked, which the table pass already does. */
  OE.fontNames = function (page, ids) {
    const map = new Map();
    const co = page && page.commonObjs;
    if (!co || typeof co.get !== "function") return map;
    for (const id of ids || []) {
      if (!id || map.has(id)) continue;
      try {
        // has() first: get() THROWS on an unresolved id rather than returning
        // null, and one unloaded font must not cost the whole page its faces
        if (typeof co.has === "function" && !co.has(id)) continue;
        const d = co.get(id);
        const nm = d && (d.name || d.loadedName || d.fallbackName);
        if (nm) map.set(id, nm);
      } catch (e) { /* this font stays default; the rest still resolve */ }
    }
    return map;
  };

  /** Every font id a page's lines refer to. */
  function fontIdsOf(lines) {
    const ids = new Set();
    for (const l of lines || []) for (const tk of l.tokens || []) if (tk.f) ids.add(tk.f);
    return ids;
  }

  /** The face most of a line's characters are set in. */
  function lineFont(line, names) {
    const weigh = new Map();
    for (const tk of line.tokens || []) {
      if (!tk.f) continue;
      const n = (names && names.get(tk.f)) || tk.f;
      weigh.set(n, (weigh.get(n) || 0) + (tk.text ? tk.text.length : 1));
    }
    let best = null, bestN = 0;
    for (const [n, c] of weigh) if (c > bestN) { best = n; bestN = c; }
    return best ? OE.mapFont(best) : null;
  }

  /** The page's size in PDF points, rotation applied. */
  OE.pageSize = function (page) {
    try {
      const v = page.getViewport({ scale: 1 });
      return { w: Math.round(v.width), h: Math.round(v.height) };
    } catch (e) {
      const box = (page.view || [0, 0, 612, 792]);
      return { w: Math.round(box[2] - box[0]), h: Math.round(box[3] - box[1]) };
    }
  };

  /** One line's paragraph record: its text, the point size it was set in, the
      distance down to the next line, and its left edge — all in PDF points,
      which are also Word's points, so no conversion is needed beyond twips. */
  OE.lineMetrics = function (line, next, names) {
    const size = line.h > 0.5 ? line.h : 0;
    // leading is the gap to the NEXT line's baseline; the last line of a page
    // has none, so it borrows its own size
    /* The last line on a page has no next line to measure against, and
       falling back to Word's default paragraph height made it taller than the
       line it replaced — enough, on a full page, to push the page over. Its
       own size plus normal leading is both closer and never larger. */
    const lead = (next && next.y != null && line.y != null && line.y - next.y > 0.5)
      ? line.y - next.y : (size ? size * 1.15 : 0);
    const x = line.tokens && line.tokens.length ? line.tokens[0].x : 0;
    return { text: line.text, size, lead, x, y: line.y, font: lineFont(line, names) };
  };

  /** The size most of the document's pages share — Word sections carry ONE
      page size, so a document that mixes them has to pick the dominant one
      rather than force everything to Letter. */
  function dominantPageSize(pages) {
    const tally = new Map();
    for (const pg of pages) {
      if (!pg.size) continue;
      const k = pg.size.w + "x" + pg.size.h;
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    let best = null, bestN = 0;
    for (const [k, n] of tally) if (n > bestN) { best = k; bestN = n; }
    if (!best) return { w: 612, h: 792 };
    const [w, h] = best.split("x").map(Number);
    return { w, h };
  }

  /** Margins that clear the text on every page, in PDF points. Derived from
      where the text actually sits rather than assumed, so a document with a
      narrow gutter keeps its line length instead of being squeezed. */
  function textMargins(pages, size) {
    let left = Infinity, top = Infinity, bottom = Infinity;
    for (const pg of pages) {
      for (const q of pg.paragraphs || []) {
        if (q.x != null && q.x < left) left = q.x;
        if (q.y != null) {
          const t = size.h - q.y - (q.size || 10);
          if (t < top) top = t;
          if (q.y < bottom) bottom = q.y;
        }
      }
    }
    /* Give the text box a few points more than the ink needs. The extents
       above are where glyphs actually sit, but a renderer wants a little more
       than that — and the shortfall is tiny and fatal: measured at 15,244
       twips of content into 15,240 of usable height, four twips over, which
       spilled every single page onto a second one. SLACK buys the rounding
       back. */
    const SLACK = 3;   // points, off each derived margin
    const clamp = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v - SLACK)) : lo);
    // never below 18pt (a quarter inch): a zero margin makes Word drop content
    // into the unprintable area, and some printers refuse the file outright
    return {
      left: clamp(left, 18, size.w / 3),
      right: clamp(left, 18, size.w / 3),   // mirror the left edge; the right
                                            // ragged edge is not a reliable margin
      top: clamp(top, 18, size.h / 3),
      bottom: clamp(bottom, 18, size.h / 3),
    };
  }

  OE.collect = async function (app, pages) {
    const doc = app.currentDoc;
    if (!doc) return null;
    const range = (pages && pages.length) ? pages
      : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const edits = (global.Volt && global.Volt.Ann) ? global.Volt.Ann.list.filter((a) => a.type === "text") : [];
    const out = [];
    for (const p of range) {
      if (p < 1 || p > doc.numPages) continue;
      const page = await doc.getPage(p);
      const pt = await pageTables(page, edits.filter((e) => e.page === p));
      const size = OE.pageSize(page);
      // column order BEFORE metrics: leading is the gap to the next line in
      // reading order, which in two columns is the line below it in the same
      // column, not the one beside it in the other
      const kept = OE.orderByColumns(pt.lines.filter((l, i) => !pt.lineIndexes.has(i)), size.w);
      const names = OE.fontNames(page, fontIdsOf(kept));
      const paragraphs = kept.map((l, i) => OE.lineMetrics(l, kept[i + 1], names));
      const images = await OE.detectImages(page, pt.ops);
      out.push({ num: p, size, paragraphs, tables: pt.tables, images });
    }
    return { title: (app.currentDocInfo && app.currentDocInfo.name) || "Document", pages: out };
  };

  /* ── text-only exports ───────────────────────────────────────
     The Word/PowerPoint collectors run table detection, grid analysis and
     image extraction over every page, which is where their cost and their
     failure modes live: a document whose ruling lines confuse the grid pass
     comes out with prose absorbed into a table, and a huge scanned file
     spends minutes extracting pictures nobody asked for.

     These exports promise less and always deliver it. No tables, no images,
     no layout reconstruction — the words, in reading order, page by page.
     They are the honest option to reach for when the layout-preserving export
     gets a document wrong, and they are what you want when the text is all
     you were ever after. */

  /** Text only: every page's lines in reading order, with text-edit
      annotations applied. Returns the same shape OE.docx() consumes, with
      empty tables/images, so the text-only .docx is the ordinary builder fed
      a document that simply has nothing but paragraphs in it.
      pages: optional array of 1-based page numbers (see collect). */
  OE.collectText = async function (app, pages) {
    const doc = app.currentDoc;
    if (!doc) return null;
    const range = (pages && pages.length) ? pages
      : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const edits = (global.Volt && global.Volt.Ann) ? global.Volt.Ann.list.filter((a) => a.type === "text") : [];
    const out = [];
    for (const p of range) {
      if (p < 1 || p > doc.numPages) continue;
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = (tc.items || []).filter((i) => i.str && i.str.trim());
      const size = OE.pageSize(page);
      const raw = OE.groupLines(items);
      applyTextEdits(raw, edits.filter((e) => e.page === p));
      const lines = OE.orderByColumns(raw, size.w);
      const names = OE.fontNames(page, fontIdsOf(lines));
      out.push({ num: p, size, tables: [], images: [],
        paragraphs: lines.map((l, i) => OE.lineMetrics(l, lines[i + 1], names)) });
    }
    return { title: (app.currentDocInfo && app.currentDocInfo.name) || "Document", pages: out };
  };

  /** Plain text of a collectText() document. Pages are separated by a blank
      line and a "--- Page N ---" rule, so a reader can still tell where they
      are without the marker being mistaken for content. */
  OE.txt = function (doc) {
    if (!doc || !doc.pages) return "";
    const parts = [];
    for (const page of doc.pages) {
      if (parts.length) parts.push("");
      parts.push("--- Page " + page.num + " ---", "");
      for (const para of page.paragraphs) parts.push(para.text);
    }
    // CRLF: these land on Windows and get opened in Notepad often enough that
    // bare LF showing as one run-on line is a real complaint
    return parts.join("\r\n") + "\r\n";
  };

  /** One CSV cell, RFC 4180: quote when the value contains a comma, a quote
      or a newline, and double any embedded quote. */
  function csvCell(v) {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.split('"').join('""') + '"' : s;
  }

  /** Detected tables as one CSV file. Tables are separated by a blank line and
      a "# Table N (page P)" comment; with a single table the file is plain
      CSV a spreadsheet opens without a word. */
  OE.csv = function (tables) {
    const list = tables || [];
    const out = [];
    list.forEach((t, i) => {
      const rows = t.rows || t;
      if (list.length > 1) {
        if (out.length) out.push("");
        out.push(csvCell("# Table " + (i + 1) + (t.page ? " (page " + t.page + ")" : "")));
      }
      for (const row of rows) out.push((row || []).map(csvCell).join(","));
    });
    return out.join("\r\n") + "\r\n";
  };

  /** Only the detected tables (for xlsx/tsv — skips image extraction).
      pages: optional array of 1-based page numbers (see collect). */
  OE.collectTables = async function (app, pages) {
    const doc = app.currentDoc;
    if (!doc) return [];
    const range = (pages && pages.length) ? pages
      : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const tables = [];
    for (const p of range) {
      if (p < 1 || p > doc.numPages) continue;
      const page = await doc.getPage(p);
      const pt = await pageTables(page, []);
      for (const grid of pt.tables) tables.push({ page: p, rows: grid });
    }
    return tables;
  };

  global.OfficeExport = OE;
})(typeof window !== "undefined" ? window : globalThis);
