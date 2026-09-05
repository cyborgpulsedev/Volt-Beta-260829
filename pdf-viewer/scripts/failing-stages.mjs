// ═══════════════════════════════════════════════════════════════
//   Volt — name WHICH assertion failed in a SMOKE_RESULT
//
//   One copy, imported by every gate that runs the smoke. There were two,
//   they drifted, and each carried a blind spot the other did not — so a CI
//   failure printed "failing stages: pageMgr" (a stage with ~320 booleans)
//   and could not be diagnosed without pushing a commit just to see more.
//
//   The two blind spots this must never regain:
//     · Stop-at-the-first-red. A big stage is usually red only because a
//       nested group under it is red, and it has no false key of its own.
//       So: descend FIRST, and descend even into a node already known red.
//     · Children that CANNOT be red. A stage's allOk is a conjunction over
//       groups (ctrlA, aaa, clr, wsel, bsel, aiW) that carry no allOk of
//       their own. Nothing marks them red, so their false keys were never
//       collected. When nothing deeper speaks up, scan the whole subtree.
//
//   Known ceiling: a term that is UNDEFINED rather than false is invisible
//   here — JSON.stringify drops it on the way out of the renderer. If that
//   ever turns out to be a cause, stamp the failing term names in main.js
//   rather than trying to infer them from the dump.
// ═══════════════════════════════════════════════════════════════

const SKIP = new Set(["allOk", "pass", "ok"]);

/* A subtree that declares itself healthy is not evidence about a failure.
   toolbarResize records `overflow: false` and `label: false` per window size
   as ordinary MEASUREMENTS - both are the normal reading at most sizes - so a
   deep scan harvested a dozen of them, filled the report, and pushed the real
   cause into "+5 more". If a node carries its own verdict and that verdict is
   true, its contents are readings, not findings. */
const isVerdict = (k) => k === "ok" || k === "allOk" || k === "pass" || /^[a-z]\w*Ok$/.test(k);
function declaresHealthy(node) {
  let sawVerdict = false;
  for (const [k, v] of Object.entries(node)) {
    if (!isVerdict(k)) continue;
    if (v === false) return false; // it says it failed - definitely look inside
    if (v === true) sawVerdict = true;
  }
  return sawVerdict;
}

/** Every false leaf under a node, named by path relative to it. */
function falseLeaves(node, path, out) {
  for (const [k, v] of Object.entries(node)) {
    const here = path ? path + "." + k : k;
    if (v === false && !SKIP.has(k)) out.push(here);
    // a group that threw records only `error` - not false, but the whole story
    else if (k === "error" && v) out.push(here + "=" + String(v).slice(0, 120));
    else if (v && typeof v === "object") {
      if (Array.isArray(v) || !declaresHealthy(v)) falseLeaves(v, here, out);
    }
  }
  return out;
}

function ownFalse(node) {
  const out = [];
  for (const [k, v] of Object.entries(node)) {
    if (v === false && !SKIP.has(k)) out.push(k);
  }
  return out;
}

/**
 * Describe why a parsed SMOKE_RESULT is red, naming the failing assertions.
 * Returns a human string; never throws on odd input.
 */
export function failingStages(result) {
  if (!result || typeof result !== "object") return "(no parsed result)";
  const fails = [];
  const walk = (node, path, isRoot) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path + "[" + i + "]", false));
      return;
    }
    const before = fails.length;
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === "object") walk(v, path ? path + "." + k : k, false);
    }
    /* A group that threw carries ONLY `error` - no allOk, no false key. It was
       therefore never "red", so the walk skipped it and the failure surfaced as
       a bare parent name. This is the third blind spot this file has had. */
    const red = node.allOk === false || node.pass === false || !!node.error ||
      // an ok:false leaf (launcherGate, realKeys, a bridge guard) — but the
      // root's own `ok` is the aggregate verdict, not a stage of its own
      (!isRoot && node.ok === false && !("allOk" in node) && !("pass" in node));
    if (!red) return;
    let why = ownFalse(node);
    // nothing of its own, and nothing deeper explained it — scan the subtree
    if (!why.length && fails.length === before) why = falseLeaves(node, "", []);
    if (node.error && !why.some((w) => w.startsWith("error="))) why.push("error=" + String(node.error).slice(0, 120));
    if (!why.length) {
      if (fails.length === before) fails.push(path || "(root)");
      return;
    }
    fails.push(path + " (" + why.slice(0, 12).join(", ") +
      (why.length > 12 ? ", +" + (why.length - 12) + " more" : "") + ")");
  };
  walk(result, "", true);
  if (!fails.length && result.ok === false) return "probe reported ok:false (no stage detail)";
  return fails.join(" | ") || "(nothing reported false)";
}
