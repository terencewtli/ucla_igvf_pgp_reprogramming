/* Landing page renderer. All content comes from data/*.json so the page stays
   in sync with the portal crawl (build/fetch_igvf.py).

   data/filesets.json  page structure: tiers, per-set file lists
   data/files.json     flat index of all 1,813 files, filtered by the builder
*/

const MOD_COLOR = {
  IGVFDS3268OMJN: "var(--m-multiome)",
  IGVFDS9439VWMI: "var(--m-snmct)",
  IGVFDS8004ZFOL: "var(--m-snm3c)",
  IGVFDS6501PVZQ: "var(--m-spatial)",
  IGVFDS1270EUID: "var(--m-wgs)",
};

const TIER_LABEL = {
  "analysis-ready": "Analysis-ready",
  processed: "Processed",
  raw: "Raw",
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (n) => Number(n).toLocaleString("en-US");

/* Decimal units, matching what the portal reports. */
function bytes(n) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/* ------------------------------------------------------- copy / save utils */

/* Buttons that copy text or save a file are wired by data-attribute so the
   generated markup stays declarative. Payloads live in PAYLOAD, keyed by id. */
const PAYLOAD = new Map();
let payloadSeq = 0;

function stash(text) {
  const key = "p" + (++payloadSeq);
  PAYLOAD.set(key, text);
  return key;
}

function copyBtn(text, label = "Copy", title = "") {
  return `<button class="cbtn" data-copy="${stash(text)}"
    ${title ? `title="${esc(title)}"` : ""}>${esc(label)}</button>`;
}

function saveBtn(text, filename, label) {
  return `<button class="cbtn" data-save="${stash(text)}"
    data-filename="${esc(filename)}">${esc(label)}</button>`;
}

document.addEventListener("click", async (e) => {
  const c = e.target.closest("[data-copy]");
  if (c) {
    const text = PAYLOAD.get(c.dataset.copy) || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const was = c.textContent;
    c.textContent = "Copied";
    c.classList.add("ok");
    setTimeout(() => { c.textContent = was; c.classList.remove("ok"); }, 1400);
    return;
  }
  const s = e.target.closest("[data-save]");
  if (s) {
    const blob = new Blob([PAYLOAD.get(s.dataset.save) || ""],
      { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = s.dataset.filename || "igvf-download.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
});

/* A shell snippet with its own copy button. */
function codeBlock(text, note = "") {
  return `<div class="code">
      <div class="codebar">${note ? `<span>${esc(note)}</span>` : "<span></span>"}
        ${copyBtn(text)}</div>
      <pre>${esc(text)}</pre>
    </div>`;
}

/* ---------------------------------------------------------------- figure */
function renderFigure() {
  document.getElementById("fig1").innerHTML = `
    <figure class="figcard">
      <a href="figures/fig1.png" target="_blank" rel="noopener">
        <img src="figures/fig1-2400.png" width="2400" height="696"
             srcset="figures/fig1-1600.png 1600w,
                     figures/fig1-2400.png 2400w,
                     figures/fig1-3200.png 3200w"
             sizes="(max-width: 1320px) calc(100vw - 40px), 1280px"
             alt="Figure 1A. Fibroblasts from four donors reprogrammed to iPSC and sampled across 11 time points, profiled by 10x Multiome, snmCT-seq, sn-m3C-seq and CosMx SMI">
      </a>
    </figure>`;
}

/* ------------------------------------------------- data: pipeline tiers */
function renderTiers(d) {
  const head = `<div class="tierhead">
      <span>Modality</span><span>Raw</span><span>Processed</span>
      <span>Analysis-ready</span><span></span></div>`;

  // Every count links to the portal search that lists exactly those files.
  const cell = (nFiles, nBytes, filesUrl, nSets, setsUrl, setsLabel, extra = "") => `
      <div class="cell ${extra}">
        <a class="cellmain" href="${esc(filesUrl)}" target="_blank" rel="noopener">
          <b>${num(nFiles)}</b><span>files · ${bytes(nBytes)} ↗</span></a>
        <a class="cellsub" href="${esc(setsUrl)}" target="_blank" rel="noopener">${nSets} ${setsLabel} ↗</a>
      </div>`;

  const rows = d.sets.map((s) => `
    <div class="trow">
      <div class="mod">
        <span class="swatch" style="background:${MOD_COLOR[s.accession]}"></span>
        <span><b>${esc(s.label)}</b><span>${esc(s.sublabel)}</span></span>
      </div>
      ${cell(s.measurement.n_files, s.measurement.bytes, s.measurement.files_search,
             s.measurement.n_sets, s.measurement.sets_search, "sets")}
      ${cell(s.intermediate.n_files, s.intermediate.bytes, s.intermediate.files_search,
             s.intermediate.n_sets, s.intermediate.sets_search, "sets")}
      ${cell(s.files.length, s.bytes, s.files_search, 1, s.portal, "set", "final")}
      <div class="dl">
        <a href="${esc(s.portal)}" target="_blank" rel="noopener">${esc(s.accession)} ↗</a>
        <span class="doi">doi:${esc(s.doi)}</span>
      </div>
    </div>`).join("");

  const t = d.totals;
  const totCell = (n, nBytes, url, sets, extra = "") => `
      <div class="cell ${extra}">
        <a class="cellmain" href="${esc(url)}" target="_blank" rel="noopener">
          <b>${num(n)}</b><span>files · ${bytes(nBytes)} ↗</span></a>
        <span class="cellsub plain">${sets} sets</span>
      </div>`;
  const sum = (k, f) => d.sets.reduce((a, s) => a + (f ? s[k][f] : s[k]), 0);
  const tot = `<div class="trow total" style="border-bottom:none">
      <div class="mod"><span class="swatch" style="background:transparent"></span>
        <span><b>Total</b><span>across all modalities</span></span></div>
      ${totCell(sum("measurement", "n_files"), sum("measurement", "bytes"),
                t.search.measurement, t.measurement)}
      ${totCell(sum("intermediate", "n_files"), sum("intermediate", "bytes"),
                t.search.intermediate, t.intermediate)}
      ${totCell(d.sets.reduce((a, s) => a + s.files.length, 0), sum("bytes"),
                t.search.principal, t.principal, "final")}
      <div class="dl"><a href="${esc(t.search.all)}" target="_blank" rel="noopener">all ${num(t.files)} files ↗</a>
        <span class="doi">${bytes(t.bytes)} total</span></div>
    </div>`;

  document.getElementById("tiers").innerHTML = head + rows + tot;
}

/* ==================================================== download: tier 3 */

/* What distinguishes this file from its siblings: the portal's own summary when
   it says more than the content type, otherwise the submitted filename — the
   spatial set has three cell-by-gene matrices, one per slide pair. */
function fileHint(f) {
  if (f.summary && f.summary !== f.content_type) return f.summary;
  return f.filename || f.alias || "";
}

/* One analysis-ready file: what it is, how big, and a link that downloads it. */
function fileRow(f) {
  return `<tr>
      <td class="ct">${esc(f.content_type)}
        ${fileHint(f) ? `<small>${esc(fileHint(f))}</small>` : ""}</td>
      <td><span class="fmt">${esc(f.file_format)}</span></td>
      <td class="sz">${bytes(f.size)}</td>
      <td class="acc"><a href="https://data.igvf.org${esc(f.href)}"
            target="_blank" rel="noopener">${esc(f.accession)} ↗</a></td>
      <td class="act">
        <a class="dbtn" href="${esc(f.download)}">↓ Download</a>
        ${copyBtn(f.download, "URL", "Copy the download URL")}
        ${copyBtn(f.s3_uri || "", "S3", "Copy the s3:// URI")}
      </td>
    </tr>`;
}

function renderReady(d) {
  const nFiles = d.sets.reduce((a, s) => a + s.files.length, 0);
  const nBytes = d.sets.reduce((a, s) => a + s.bytes, 0);
  document.getElementById("ar-count").textContent =
    `${num(nFiles)} files, ${bytes(nBytes)} in total`;

  document.getElementById("ready").innerHTML = d.sets.map((s) => {
    const urls = s.files.map((f) => f.download).join("\n");
    const s3 = s.files.map((f) => f.s3_uri).filter(Boolean).join("\n");
    const script = curlScript(s.files, `${s.label} — analysis-ready`);
    return `
    <div class="dcard">
      <div class="dhead">
        <span class="swatch" style="background:${MOD_COLOR[s.accession]}"></span>
        <div class="dtitle">
          <b>${esc(s.label)}</b>
          <span>${esc(s.sublabel)} · ${s.files.length} files · ${bytes(s.bytes)}</span>
        </div>
        <a class="accbtn" href="${esc(s.portal)}" target="_blank" rel="noopener">${esc(s.accession)} ↗</a>
      </div>
      <table class="ftable dl">
        <thead><tr><th>File type</th><th>Format</th><th>Size</th>
          <th>Accession</th><th></th></tr></thead>
        <tbody>${s.files.map(fileRow).join("")}</tbody>
      </table>
      <div class="dfoot">
        <span class="lbl">All ${s.files.length} files:</span>
        ${saveBtn(urls + "\n", `${s.accession}-urls.txt`, "urls.txt")}
        ${saveBtn(script, `download-${s.accession}.sh`, "curl script")}
        ${copyBtn(s3, "S3 URIs")}
        <a href="${esc(s.manifest_file)}" download>manifest.tsv</a>
        <a href="${esc(s.manifest)}" target="_blank" rel="noopener">live manifest ↗</a>
      </div>
      <details class="about">
        <summary>About this set</summary>
        <p class="desc">${esc(s.description || s.summary)}</p>
        <div class="kv">
          <span><b>Lab</b> ${esc(s.lab)}</span>
          <span><b>Assays</b> ${esc(s.assay_titles.join(", "))}</span>
          ${s.workflows.length ? `<span><b>Workflows</b> ${esc(s.workflows.join(", "))}</span>` : ""}
          <span><b>Samples</b> ${s.n_samples}</span>
          <span><b>DOI</b> <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">${esc(s.doi)}</a></span>
        </div>
      </details>
    </div>`;
  }).join("");
}

/* ==================================== download: processed + raw, by type */

/* The portal's metadata TSV is the manifest; column 'File download URL' is the
   only column a download loop needs. Found by name so the recipe survives a
   schema change. */
function manifestPipe(manifestUrl, jobs = 4) {
  return `curl -sL "${manifestUrl}" \\
  | awk -F'\\t' 'NR==2{for(i=1;i<=NF;i++) if($i=="File download URL") c=i} NR>2&&c{print $c}' \\
  | xargs -n1 -P${jobs} curl -fL -C - -O --retry 3`;
}

function typeRows(tier, tierKey, setAcc) {
  return tier.types.map((t) => `<tr>
      <td class="ct">${esc(t.content_type)}</td>
      <td><span class="fmt">${esc(t.file_format)}</span></td>
      <td class="sz">${num(t.n)}</td>
      <td class="sz">${bytes(t.bytes)}</td>
      <td class="act">
        <a href="${esc(t.manifest)}" target="_blank" rel="noopener">manifest ↗</a>
        ${copyBtn(manifestPipe(t.manifest), "Copy command",
                  "Copy a curl loop that downloads exactly these files")}
        <a href="${esc(t.search)}" target="_blank" rel="noopener">browse ↗</a>
      </td>
    </tr>`).join("");
}

function tierBlock(label, tier, setAcc) {
  return `
    <div class="tierblock">
      <div class="tbhead">
        <b>${esc(label)}</b>
        <span>${tier.n_sets} sets · ${num(tier.n_files)} files · ${bytes(tier.bytes)}</span>
        ${copyBtn(manifestPipe(tier.manifest), "Copy command for all")}
        <a href="${esc(tier.manifest_file)}" download>manifest.tsv</a>
        <a href="${esc(tier.manifest)}" target="_blank" rel="noopener">live manifest ↗</a>
        <a href="${esc(tier.sets_search)}" target="_blank" rel="noopener">browse sets ↗</a>
      </div>
      <table class="ftable dl">
        <thead><tr><th>File type</th><th>Format</th><th>Files</th><th>Size</th><th></th></tr></thead>
        <tbody>${typeRows(tier, label, setAcc)}</tbody>
      </table>
    </div>`;
}

function renderBulk(d) {
  document.getElementById("bulk").innerHTML = d.sets.map((s) => `
    <details class="dcard collapsible">
      <summary>
        <span class="swatch" style="background:${MOD_COLOR[s.accession]}"></span>
        <b>${esc(s.label)}</b>
        <span class="muted">${num(s.intermediate.n_files + s.measurement.n_files)} files ·
          ${bytes(s.intermediate.bytes + s.measurement.bytes)}</span>
      </summary>
      <div class="dbody">
        ${tierBlock("Processed", s.intermediate, s.accession)}
        ${tierBlock("Raw", s.measurement, s.accession)}
        <div class="libs">
          <div class="tbhead"><b>Libraries in the processed tier</b>
            <span>${s.intermediate.n_sets} sets</span></div>
          <div class="libgrid">${s.intermediate.groups.map((g) => `
            <a class="lib" href="${esc(g.portal)}" target="_blank" rel="noopener">
              <b>${esc(g.label)}</b>
              <span>${g.n_files} files · ${bytes(g.bytes)}${g.multiplexed ? " · multiplexed" : ""}</span>
              <span class="acc">${esc(g.accession)}</span>
            </a>`).join("")}</div>
        </div>
      </div>
    </details>`).join("");
}

/* ==================================================== download: builder */

/* One tool over four dimensions: sample (donor x reprogramming day), modality,
   tier and file type. Each is optional and empty means all, so the page answers
   both "give me C29 day 0" and "give me every fragment file in the study".

   The sample axis keys on exact (donor, day) pairs rather than the cross product
   of a file's donor and day lists. The distinction only matters for the
   multiplexed Multiome libraries, and there it matters completely: one library
   carries C29, C37, C38, C39 and days 0, 1, 3, 5, but holds C29 at day 0, C37 at
   day 1, C38 at day 3 and C39 at day 5 — crossing the lists would offer it for
   twelve samples it does not contain. */

/* Scripts are emitted with a header so a file found later on a cluster still
   says where it came from. */
function scriptHeader(title, n, size) {
  return `#!/usr/bin/env bash
# ${title}
# ${n} files, ${size} — IGVF PGP reprogramming study
# generated ${new Date().toISOString().slice(0, 10)} from ${location.href.split("#")[0]}
# Public files: no credentials, no portal login. Re-run to resume.
set -euo pipefail
`;
}

function curlScript(files, title) {
  const total = files.reduce((a, f) => a + (f.size || 0), 0);
  return scriptHeader(title, files.length, bytes(total)) +
`DEST="\${1:-.}"
mkdir -p "$DEST" && cd "$DEST"

while read -r url; do
  [ -z "$url" ] && continue
  curl -fL -C - -O --retry 3 --retry-delay 5 "$url"
done <<'URLS'
${files.map((f) => f.download).join("\n")}
URLS
echo "done: ${files.length} files in $PWD"
`;
}

function awsScript(files, title) {
  const total = files.reduce((a, f) => a + (f.size || 0), 0);
  return scriptHeader(title, files.length, bytes(total)) +
`# Needs the AWS CLI. --no-sign-request: igvf-public is a public bucket.
DEST="\${1:-.}"
mkdir -p "$DEST"

while read -r uri; do
  [ -z "$uri" ] && continue
  aws s3 cp --no-sign-request "$uri" "$DEST/"
done <<'URIS'
${files.map((f) => f.s3_uri).filter(Boolean).join("\n")}
URIS
echo "done: ${files.length} files in $DEST"
`;
}

function manifestTsv(files) {
  const cols = ["file_accession", "tier", "file_set", "donors", "days",
                "donor_days", "content_type", "file_format", "size_bytes",
                "md5sum", "download_url", "s3_uri"];
  return cols.join("\t") + "\n" + files.map((f) => [
    f.accession, f.tier, f.file_set, (f.donors || []).join(";"),
    (f.days || []).join(";"), (f.donor_days || []).join(";"), f.content_type,
    f.file_format, f.size ?? "", f.md5 || "", f.download, f.s3_uri || "",
  ].join("\t")).join("\n") + "\n";
}

function renderBuilder(d, index) {
  const cols = index.columns;
  const rec = (row) => Object.fromEntries(cols.map((c, i) => [c, row[i]]));

  /* Which library a file came from: a processed file belongs to the
     intermediate set itself, a raw file to one of its measurement sets. */
  const libOf = new Map();
  const lib = new Map();
  for (const s of d.sets) {
    for (const g of s.intermediate.groups) {
      lib.set(g.accession, { g, set: s });
      libOf.set(g.accession, g.accession);
      for (const m of g.measurement_accessions || []) libOf.set(m, g.accession);
    }
  }

  const files = [];
  for (const [setAcc, rows] of Object.entries(index.sets)) {
    for (const row of rows) {
      const f = rec(row);
      f.set = setAcc;
      f.lib = libOf.get(f.file_set);
      files.push(f);
    }
  }

  const nameOf = {};
  for (const m of Object.values(d.donor_meta || {})) nameOf[m.name] = m;

  /* Grid axes come from the per-sample tiers only. A8 is left out: not a
     manuscript line, one time point, pilot spatial runs only. */
  const cellKeys = new Set();
  for (const f of files)
    if (f.tier !== "analysis-ready")
      for (const k of f.donor_days || []) cellKeys.add(k);
  const donors = [...new Set([...cellKeys].map((k) => k.split(":")[0]))]
    .filter((dn) => nameOf[dn]?.in_manuscript !== false).sort();
  const has = (dn, dy) => cellKeys.has(`${dn}:${dy}`);
  const days = [...new Set([...cellKeys].map((k) => +k.split(":")[1]))]
    .filter((dy) => donors.some((dn) => has(dn, dy))).sort((a, b) => a - b);
  const gridCells = [];
  for (const dn of donors)
    for (const dy of days) if (has(dn, dy)) gridCells.push(`${dn}:${dy}`);

  /* Modalities that touch a sample at all, for the dots on each cell. */
  const cellSets = new Map();
  for (const f of files) {
    if (f.tier === "analysis-ready") continue;
    for (const k of f.donor_days || []) {
      let s = cellSets.get(k);
      if (!s) { s = new Set(); cellSets.set(k, s); }
      s.add(f.set);
    }
  }

  /* Every dimension: empty means all. Processed is the opening tier because it
     is the one the grid resolves — analysis-ready files are whole-study, so
     defaulting to them would show a grid of dashes, and they already have a
     one-click section of their own above. */
  const state = { cells: new Set(), sets: new Set(), tiers: new Set(["processed"]),
                  types: new Set() };

  /* An analysis-ready file is one matrix over the whole study, so it is not
     filtered by sample — it contains every donor and day there is. The other
     tiers are per-library and do answer to the grid. */
  function match(f, skip) {
    if (skip !== "set" && state.sets.size && !state.sets.has(f.set)) return false;
    if (skip !== "tier" && state.tiers.size && !state.tiers.has(f.tier)) return false;
    if (skip !== "type" && state.types.size && !state.types.has(f.content_type)) return false;
    if (skip !== "cell" && state.cells.size && f.tier !== "analysis-ready" &&
        !(f.donor_days || []).some((k) => state.cells.has(k))) return false;
    return true;
  }

  const selected = () => files.filter((f) => match(f, null));

  function facet(key, value) {
    const t = {};
    for (const f of files) {
      if (!match(f, key)) continue;
      for (const v of value(f)) {
        const e = t[v] || (t[v] = { n: 0, b: 0 });
        e.n++;
        e.b += f.size || 0;
      }
    }
    return t;
  }

  /* Faceted browser, after the ENCODE matrix: filters down the left, the sample
     matrix and the result in the main column. Every facet term carries the count
     it would yield, so the next click is always informed. */
  const root = document.getElementById("builder");
  root.innerHTML = `
    <div class="fbrowse">
      <aside class="facets">
        <div class="fhead">
          <b>Filters</b>
          <button class="flink" id="b-clear">Clear all</button>
        </div>
        <details class="fgroup" open>
          <summary>Modality</summary>
          <div class="fterms" id="b-set"></div>
        </details>
        <details class="fgroup" open>
          <summary>Tier</summary>
          <div class="fterms" id="b-tier"></div>
        </details>
        <details class="fgroup" open>
          <summary>File type</summary>
          <div class="fterms" id="b-type"></div>
        </details>
        <details class="fgroup">
          <summary>Donor</summary>
          <div class="fterms" id="b-donor"></div>
        </details>
        <details class="fgroup">
          <summary>Time point</summary>
          <div class="fterms" id="b-day"></div>
        </details>
      </aside>

      <div class="fmain">
        <div class="fbar">
          <div class="fcount" id="b-count"></div>
          <div class="fpills" id="b-pills"></div>
        </div>

        <div class="matrix">
          <div class="mhead">
            <b>Samples</b>
            <span class="ddlegend">${d.sets.map((s) =>
              `<span><i style="background:${MOD_COLOR[s.accession]}"></i>${esc(s.label)}</span>`).join("")}</span>
            <button class="flink" id="b-allcells">Select all</button>
            <button class="flink" id="b-nocells">Clear</button>
          </div>
          <div class="scroller">
            <div class="ddgrid" id="b-grid"
                 style="grid-template-columns:92px repeat(${days.length},minmax(50px,1fr))"></div>
          </div>
          <p class="ddfoot" id="b-gridnote"></p>
        </div>

        <div class="bout" id="b-out"></div>
      </div>
    </div>`;

  /* One facet term: a tick, its name, and the number of files it would yield
     given everything else already picked. */
  const term = (group, key, label, on, n, b) =>
    `<button class="fterm ${on ? "on" : ""}" data-g="${group}" data-k="${esc(key)}"
       title="${esc(label)} — ${num(n)} files, ${bytes(b)}">
       <span class="tick"></span><span class="lbl">${esc(label)}</span>
       <span class="cnt">${num(n)}</span></button>`;

  function drawGrid(tally) {
    const out = [`<div class="ddcorner">donor · day</div>`];
    for (const dy of days) {
      const on = donors.every((dn) => !has(dn, dy) || state.cells.has(`${dn}:${dy}`)) &&
                 donors.some((dn) => has(dn, dy) && state.cells.has(`${dn}:${dy}`));
      out.push(`<button class="ddhead ${on ? "on" : ""}" data-day="${dy}"
        title="Select every sample taken on day ${dy}">${dy}</button>`);
    }
    for (const dn of donors) {
      const meta = nameOf[dn] || {};
      const on = days.every((dy) => !has(dn, dy) || state.cells.has(`${dn}:${dy}`));
      out.push(`<button class="ddname ${on ? "on" : ""}" data-donor="${esc(dn)}"
          title="Select every time point for ${esc(dn)}">
          <b>${esc(dn)}</b><span>${esc(meta.efficiency || "")}</span></button>`);
      for (const dy of days) {
        const k = `${dn}:${dy}`;
        if (!has(dn, dy)) { out.push(`<span class="ddcell empty"></span>`); continue; }
        const e = tally.get(k);
        const mods = [...(cellSets.get(k) || [])]
          .filter((a) => !state.sets.size || state.sets.has(a));
        const cls = ["ddcell", state.cells.has(k) ? "on" : "", e ? "" : "none"]
          .filter(Boolean).join(" ");
        out.push(`<button class="${cls}" data-g="cell" data-k="${k}"
          title="${esc(dn)} day ${dy}${e ? ` — ${e.n} files, ${bytes(e.b)}`
            : " — nothing in the current selection"}">
          <span class="dots">${mods.map((a) =>
            `<i style="background:${MOD_COLOR[a]}"></i>`).join("")}</span>
          <span class="n">${e ? e.n : "—"}</span></button>`);
      }
    }
    document.getElementById("b-grid").innerHTML = out.join("");

    const onlyFinal = state.tiers.size === 1 && state.tiers.has("analysis-ready");
    document.getElementById("b-gridnote").innerHTML = onlyFinal
      ? `Analysis-ready files are one matrix over the whole study, so they are not
         per-sample and the grid does not narrow them. Add the processed or raw
         tier to pick samples.`
      : (state.cells.size ? "" : "No samples picked — every sample is included.");
  }

  /* Per-sample file tally for one cell, honouring every filter but the sample
     one, so the matrix and the donor/day facets say what a click would add. */
  function cellTally() {
    const t = new Map();
    for (const f of files) {
      if (f.tier === "analysis-ready") continue;
      if (!match(f, "cell")) continue;
      for (const k of f.donor_days || []) {
        const e = t.get(k) || { n: 0, b: 0 };
        e.n++; e.b += f.size || 0;
        t.set(k, e);
      }
    }
    return t;
  }

  function drawFacets(tally) {
    const sets = facet("set", (f) => [f.set]);
    document.getElementById("b-set").innerHTML = d.sets.map((s) =>
      term("set", s.accession, s.label, state.sets.has(s.accession),
           sets[s.accession] ? sets[s.accession].n : 0,
           sets[s.accession] ? sets[s.accession].b : 0)).join("");

    const tiers = facet("tier", (f) => [f.tier]);
    document.getElementById("b-tier").innerHTML =
      ["analysis-ready", "processed", "raw"].map((k) =>
        term("tier", k, TIER_LABEL[k], state.tiers.has(k),
             tiers[k] ? tiers[k].n : 0, tiers[k] ? tiers[k].b : 0)).join("");

    const types = facet("type", (f) => [f.content_type]);
    document.getElementById("b-type").innerHTML =
      Object.keys(types).sort().map((k) =>
        term("type", k, k, state.types.has(k), types[k].n, types[k].b)).join("")
      || '<span class="fnone">nothing in this selection</span>';

    // Donor and time point are the matrix's own axes, offered as lists too.
    const rowOn = (dn) => days.every((dy) => !has(dn, dy) || state.cells.has(`${dn}:${dy}`));
    const colOn = (dy) => donors.every((dn) => !has(dn, dy) || state.cells.has(`${dn}:${dy}`));
    const sumOver = (keys) => keys.reduce((a, k) => {
      const e = tally.get(k);
      return { n: a.n + (e ? e.n : 0), b: a.b + (e ? e.b : 0) };
    }, { n: 0, b: 0 });

    document.getElementById("b-donor").innerHTML = donors.map((dn) => {
      const t = sumOver(days.filter((dy) => has(dn, dy)).map((dy) => `${dn}:${dy}`));
      return term("donor", dn, dn, rowOn(dn), t.n, t.b);
    }).join("");

    document.getElementById("b-day").innerHTML = days.map((dy) => {
      const t = sumOver(donors.filter((dn) => has(dn, dy)).map((dn) => `${dn}:${dy}`));
      return term("day", String(dy), `day ${dy}`, colOn(dy), t.n, t.b);
    }).join("");
  }

  /* The selection as removable pills, so what is currently on is readable
     without scanning five facet lists. */
  function drawBar(picked) {
    const total = picked.reduce((a, f) => a + (f.size || 0), 0);
    document.getElementById("b-count").innerHTML =
      `<b>${num(picked.length)}</b> file${picked.length === 1 ? "" : "s"}
       <span>${bytes(total)}</span>`;

    const pills = [];
    const keys = [...state.cells].sort();
    if (keys.length <= 6)
      for (const k of keys) pills.push(["cell", k, cellLabel(k)]);
    else pills.push(["cells", "", `${keys.length} samples`]);
    for (const a of state.sets)
      pills.push(["set", a, d.sets.find((x) => x.accession === a).label]);
    for (const t of state.tiers) pills.push(["tier", t, TIER_LABEL[t]]);
    for (const t of state.types) pills.push(["type", t, t]);

    document.getElementById("b-pills").innerHTML = pills.length
      ? pills.map(([g, k, label]) =>
          `<button class="fpill" data-g="${g}" data-k="${esc(k)}">${esc(label)}
             <i>×</i></button>`).join("")
      : `<span class="fnone">no filters — every file in the study</span>`;
  }

  const cellLabel = (k) => `${k.split(":")[0]} day ${k.split(":")[1]}`;

  function drawOut(picked) {
    const out = document.getElementById("b-out");
    const total = picked.reduce((a, f) => a + (f.size || 0), 0);
    const keys = [...state.cells].sort();

    const title = [
      keys.length ? (keys.length <= 4 ? keys.map(cellLabel).join(", ")
                                      : `${keys.length} samples`) : "all samples",
      state.sets.size ? [...state.sets].map((a) =>
        d.sets.find((s) => s.accession === a).label).join(" + ") : "all modalities",
      state.tiers.size ? [...state.tiers].map((t) => TIER_LABEL[t]).join(" + ")
                       : "all tiers",
      state.types.size ? [...state.types].join(", ") : "all file types",
    ].join(" · ");

    if (!picked.length) {
      out.innerHTML = `<div class="bsum"><b>No files match</b>
        <span>Widen the selection — the four dimensions are ANDed.</span></div>`;
      return;
    }

    // Per-sample files can drag in samples you did not ask for, because the
    // Multiome libraries are pooled. Say which, and how many.
    const extra = new Set();
    if (state.cells.size)
      for (const f of picked)
        if (f.tier !== "analysis-ready")
          for (const k of f.donor_days || [])
            if (!state.cells.has(k)) extra.add(k);
    const nFinal = picked.filter((f) => f.tier === "analysis-ready").length;

    // The libraries behind a sample selection, and what else each one holds.
    let libTable = "";
    if (state.cells.size) {
      const byLib = new Map();
      for (const f of picked) {
        if (f.tier === "analysis-ready") continue;
        let e = byLib.get(f.lib);
        if (!e) { e = { n: 0, b: 0, files: [] }; byLib.set(f.lib, e); }
        e.n++; e.b += f.size || 0; e.files.push(f);
      }
      const rows = [...byLib.entries()].map(([acc, e]) => {
        const entry = lib.get(acc);
        if (!entry) return "";
        const { g, set } = entry;
        const holds = g.donor_day_keys.map((k) =>
          state.cells.has(k) ? `<b>${esc(cellLabel(k))}</b>` : esc(cellLabel(k)))
          .join(", ");
        return `<tr>
          <td class="ct"><span class="swatch sm" style="background:${MOD_COLOR[set.accession]}"></span>
            ${esc(set.label)}</td>
          <td>${holds}${g.multiplexed ? ' <span class="fmt">pooled</span>' : ""}</td>
          <td class="sz">${num(e.n)}</td>
          <td class="sz">${bytes(e.b)}</td>
          <td class="acc"><a href="${esc(g.portal)}" target="_blank" rel="noopener">${esc(acc)} ↗</a></td>
          <td class="act">
            ${saveBtn(e.files.map((f) => f.download).join("\n") + "\n",
                      `${acc}-urls.txt`, "urls.txt")}
            ${copyBtn(e.files.map((f) => f.download).join("\n"), "URLs")}
          </td></tr>`;
      }).join("");
      if (rows) libTable = `
        <details class="bfiles" open>
          <summary>${byLib.size} ${byLib.size === 1 ? "library" : "libraries"} behind this selection</summary>
          <div class="scroller"><table class="ftable dl ddlibs">
            <thead><tr><th>Modality</th><th>Library holds</th><th>Files</th><th>Size</th>
              <th>Analysis set</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </details>`;
    }

    const slug = keys.length && keys.length <= 3
      ? keys.join("_").replace(/:/g, "d") : "selection";

    out.innerHTML = `
      <div class="bacts">
        ${saveBtn(picked.map((f) => f.download).join("\n") + "\n",
                  `igvf-${slug}-urls.txt`, "↓ urls.txt")}
        ${saveBtn(curlScript(picked, title), `igvf-${slug}-curl.sh`, "↓ curl script")}
        ${saveBtn(awsScript(picked, title), `igvf-${slug}-aws.sh`, "↓ aws s3 script")}
        ${saveBtn(manifestTsv(picked), `igvf-${slug}-manifest.tsv`, "↓ manifest.tsv")}
        ${copyBtn(picked.map((f) => f.download).join("\n"), "Copy URLs")}
        ${copyBtn(picked.map((f) => f.s3_uri).filter(Boolean).join("\n"), "Copy S3 URIs")}
      </div>
      ${extra.size ? `<div class="bnote">The 10x Multiome libraries are genetically
        multiplexed — one library pools four donors sampled on four different days —
        so these files also carry ${extra.size <= 6
          ? [...extra].sort().map(cellLabel).join(", ")
          : `${extra.size} samples you did not pick`}. Split them by donor with the
        WGS genotypes and the cell annotations from the analysis-ready set.</div>` : ""}
      ${state.cells.size && nFinal ? `<div class="bnote">${nFinal}
        analysis-ready ${nFinal === 1 ? "file spans" : "files span"} the whole time
        course and every donor, so ${nFinal === 1 ? "it is" : "they are"} included in
        full rather than cut to the samples you picked.</div>` : ""}
      ${libTable}
      ${codeBlock(`# after saving urls.txt next to this shell\nxargs -n1 -P4 curl -fL -C - -O --retry 3 < igvf-${slug}-urls.txt`,
                  "download in four parallel streams")}
      <details class="bfiles">
        <summary>${num(picked.length)} files</summary>
        <div class="scroller"><table class="ftable">
          <thead><tr><th>Accession</th><th>Tier</th><th>File type</th><th>Format</th>
            <th>Size</th><th>Set</th><th></th></tr></thead>
          <tbody>${picked.slice(0, 400).map((f) => `<tr>
            <td class="acc"><a href="${esc(f.download)}">${esc(f.accession)}</a></td>
            <td>${esc(TIER_LABEL[f.tier])}</td>
            <td class="ct">${esc(f.content_type)}</td>
            <td><span class="fmt">${esc(f.file_format)}</span></td>
            <td class="sz">${bytes(f.size)}</td>
            <td class="acc">${esc(f.file_set)}</td>
            <td class="act"><a class="dbtn" href="${esc(f.download)}">↓</a></td>
          </tr>`).join("")}</tbody>
        </table></div>
        ${picked.length > 400 ? `<p class="muted">Showing the first 400 of
          ${num(picked.length)}; the manifest and scripts include all of them.</p>` : ""}
      </details>`;
  }

  function draw() {
    const tally = cellTally();
    const picked = selected();
    drawGrid(tally);
    drawFacets(tally);
    drawBar(picked);
    drawOut(picked);
  }

  /* Everything that changes the selection is a button carrying data-g (which
     dimension) and data-k (which term), so the matrix, the sidebar and the
     pills all go through one path. */
  const toggle = (set, k) => { if (set.has(k)) set.delete(k); else set.add(k); };
  const toggleCells = (keys) => {
    const on = keys.every((k) => state.cells.has(k));
    keys.forEach((k) => on ? state.cells.delete(k) : state.cells.add(k));
  };
  const rowKeys = (dn) => days.filter((dy) => has(dn, dy)).map((dy) => `${dn}:${dy}`);
  const colKeys = (dy) => donors.filter((dn) => has(dn, +dy)).map((dn) => `${dn}:${dy}`);

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-g],[data-k],[data-donor],[data-day],"
      + "#b-allcells,#b-nocells,#b-clear");
    if (!t) return;
    const k = t.dataset.k;

    if (t.id === "b-allcells") gridCells.forEach((c) => state.cells.add(c));
    else if (t.id === "b-nocells") state.cells.clear();
    else if (t.id === "b-clear") {
      state.cells.clear(); state.sets.clear(); state.types.clear();
      state.tiers.clear(); state.tiers.add("processed");
    } else if (t.dataset.donor) toggleCells(rowKeys(t.dataset.donor));
    else if (t.dataset.day) toggleCells(colKeys(t.dataset.day));
    else switch (t.dataset.g) {
      case "cell":  toggleCells([k]); break;
      case "cells": state.cells.clear(); break;      // the "N samples" pill
      case "donor": toggleCells(rowKeys(k)); break;
      case "day":   toggleCells(colKeys(k)); break;
      case "set":   toggle(state.sets, k); break;
      case "type":  toggle(state.types, k); break;
      case "tier":
        toggle(state.tiers, k);
        state.types.clear();            // file types are tier-specific
        break;
    }
    draw();
  });

  draw();
}

/* ------------------------------------------------------------------- boot */
Promise.all([
  fetch("data/filesets.json").then((r) => r.json()),
  fetch("data/files.json").then((r) => r.json()),
]).then(([d, index]) => {
  renderFigure();
  renderTiers(d);
  renderReady(d);
  renderBulk(d);
  renderBuilder(d, index);
  document.getElementById("gen-date").textContent = d.generated;
}).catch((e) => {
  console.error(e);
  document.getElementById("tiers").innerHTML =
    '<div class="note">Could not load <code>data/*.json</code>. ' +
    'If you opened this file directly, serve it instead: <code>python3 -m http.server</code></div>';
});
