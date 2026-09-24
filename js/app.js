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
        <img src="figures/fig1-2400.png" width="2400" height="1971"
             srcset="figures/fig1-1600.png 1600w,
                     figures/fig1-2400.png 2400w,
                     figures/fig1-3200.png 3200w"
             sizes="(max-width: 1120px) calc(100vw - 48px), 1072px"
             alt="Figure 1. Multi-modal profiling of cellular reprogramming">
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

/* ======================================= download: by donor and time point */

/* A cell of this grid is one sample: one donor on one reprogramming day.
   Every file carries its library's exact (donor, day) pairs, which for a
   multiplexed Multiome library are not the cross product of its donor and day
   lists — one library holds C29 at day 0, C37 at day 1, C38 at day 3 and C39
   at day 5. Keying on the pairs is what lets a cell mean one sample rather
   than one library. */
function renderDonorDays(d, index) {
  const cols = index.columns;
  const rec = (row) => Object.fromEntries(cols.map((c, i) => [c, row[i]]));

  /* Which library a file came from: a processed file belongs to the
     intermediate set itself, a raw file to one of its measurement sets. */
  const libOf = new Map();       // file_set accession -> library accession
  const lib = new Map();         // library accession -> {g, set}
  for (const s of d.sets) {
    for (const g of s.intermediate.groups) {
      lib.set(g.accession, { g, set: s });
      libOf.set(g.accession, g.accession);
      for (const m of g.measurement_accessions || []) libOf.set(m, g.accession);
    }
  }

  /* Analysis-ready files are left out: each one pools the whole time course,
     so there is no honest way to cut it to a single donor-day. */
  const cellFiles = new Map();   // "C29:0" -> [file, ...]
  for (const [setAcc, rows] of Object.entries(index.sets)) {
    for (const row of rows) {
      const f = rec(row);
      if (f.tier === "analysis-ready") continue;
      f.set = setAcc;
      f.lib = libOf.get(f.file_set);
      for (const k of f.donor_days || []) {
        const a = cellFiles.get(k);
        if (a) a.push(f); else cellFiles.set(k, [f]);
      }
    }
  }

  const donors = [...new Set([...cellFiles.keys()].map((k) => k.split(":")[0]))]
    // The C-lines are the manuscript's four; A8 appears only in the spatial pilots.
    .sort((a, b) => (a[0] === "C" ? 0 : 1) - (b[0] === "C" ? 0 : 1) ||
                    a.localeCompare(b));
  const days = [...new Set([...cellFiles.keys()].map((k) => +k.split(":")[1]))]
    .sort((a, b) => a - b);
  const setsOf = (k) => [...new Set((cellFiles.get(k) || []).map((f) => f.set))];
  const has = (dn, dy) => cellFiles.has(`${dn}:${dy}`);

  const nameOf = {};
  for (const m of Object.values(d.donor_meta || {})) nameOf[m.name] = m;

  const state = { cells: new Set(["C29:0"]), tiers: new Set(["processed"]) };

  const root = document.getElementById("bydonor");
  root.innerHTML = `
    <div class="ddwrap">
      <div class="scroller">
        <div class="ddgrid" id="dd-grid"
             style="grid-template-columns:108px repeat(${days.length},minmax(60px,1fr))"></div>
      </div>
      <div class="ddbar">
        <div class="ddlegend">${d.sets.map((s) =>
          `<span><i style="background:${MOD_COLOR[s.accession]}"></i>${esc(s.label)}</span>`).join("")}</div>
        <div class="ddsel">
          <span class="blbl">Tier</span>
          <div class="chips" id="dd-tier"></div>
          <button class="cbtn" id="dd-all">Select all</button>
          <button class="cbtn" id="dd-none">Clear</button>
        </div>
      </div>
      <div class="bout" id="dd-out"></div>
    </div>`;

  function drawGrid() {
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
        const fs = cellFiles.get(k);
        if (!fs) { out.push(`<span class="ddcell empty"></span>`); continue; }
        const sets = setsOf(k);
        // Counts follow the tier chips, so a cell says what clicking it adds.
        const inTier = fs.filter((f) => state.tiers.has(f.tier));
        const size = inTier.reduce((a, f) => a + (f.size || 0), 0);
        out.push(`<button class="ddcell ${state.cells.has(k) ? "on" : ""}" data-k="${k}"
          title="${esc(dn)} day ${dy} — ${sets.length} ${
            sets.length === 1 ? "modality" : "modalities"}, ${inTier.length} files, ${bytes(size)}">
          <span class="dots">${sets.map((a) =>
            `<i style="background:${MOD_COLOR[a]}"></i>`).join("")}</span>
          <span class="n">${inTier.length}</span></button>`);
      }
    }
    document.getElementById("dd-grid").innerHTML = out.join("");

    const tally = {};
    for (const [k, fs] of cellFiles)
      if (state.cells.has(k))
        for (const f of fs) {
          const e = tally[f.tier] || (tally[f.tier] = { n: 0, b: 0 });
          e.n++; e.b += f.size || 0;
        }
    document.getElementById("dd-tier").innerHTML = ["processed", "raw"]
      .map((t) => `<button class="chip ${state.tiers.has(t) ? "on" : ""}" data-t="${t}">
        ${TIER_LABEL[t]}<span>${tally[t] ? `${num(tally[t].n)} · ${bytes(tally[t].b)}` : "—"}</span>
      </button>`).join("");
  }

  /* Files for the current selection, deduplicated: a multiplexed library is
     one file set reached from four different cells. */
  function picked() {
    const seen = new Map();
    for (const k of state.cells)
      for (const f of cellFiles.get(k) || [])
        if (state.tiers.has(f.tier)) seen.set(f.accession, f);
    return [...seen.values()];
  }

  const cellLabel = (k) => `${k.split(":")[0]} day ${k.split(":")[1]}`;

  function drawOut() {
    const out = document.getElementById("dd-out");
    const keys = [...state.cells].sort();
    if (!keys.length) {
      out.innerHTML = `<div class="bsum"><b>No samples selected</b>
        <span>Click a cell, a donor or a day above.</span></div>`;
      return;
    }
    const files = picked();
    const total = files.reduce((a, f) => a + (f.size || 0), 0);
    const what = keys.length <= 4 ? keys.map(cellLabel).join(", ")
      : `${keys.length} samples`;
    const title = `${what} · ${[...state.tiers].map((t) => TIER_LABEL[t]).join(" + ")}`;

    if (!files.length) {
      out.innerHTML = `<div class="bsum"><b>No files</b>
        <span>${esc(what)} has nothing in the selected tier.</span></div>`;
      return;
    }

    // Libraries behind the selection, and what each one holds beyond it.
    const byLib = new Map();
    for (const f of files) {
      let e = byLib.get(f.lib);
      if (!e) { e = { n: 0, b: 0, files: [] }; byLib.set(f.lib, e); }
      e.n++; e.b += f.size || 0; e.files.push(f);
    }
    const extra = new Set();
    for (const acc of byLib.keys())
      for (const k of (lib.get(acc)?.g.donor_day_keys) || [])
        if (!state.cells.has(k)) extra.add(k);

    const rows = [...byLib.entries()].map(([acc, e]) => {
      const { g, set } = lib.get(acc) || {};
      if (!g) return "";
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

    out.innerHTML = `
      <div class="bsum">
        <b>${num(files.length)} files · ${bytes(total)}</b>
        <span>${esc(title)}</span>
      </div>
      <div class="bacts">
        ${saveBtn(files.map((f) => f.download).join("\n") + "\n",
                  `igvf-${keys.join("_").replace(/:/g, "d")}-urls.txt`, "↓ urls.txt")}
        ${saveBtn(curlScript(files, title), "igvf-samples-curl.sh", "↓ curl script")}
        ${saveBtn(awsScript(files, title), "igvf-samples-aws.sh", "↓ aws s3 script")}
        ${saveBtn(manifestTsv(files), "igvf-samples-manifest.tsv", "↓ manifest.tsv")}
        ${copyBtn(files.map((f) => f.download).join("\n"), "Copy URLs")}
        ${copyBtn(files.map((f) => f.s3_uri).filter(Boolean).join("\n"), "Copy S3 URIs")}
      </div>
      ${extra.size ? `<div class="bnote">The 10x Multiome libraries are genetically
        multiplexed — one library pools four donors sampled on four different days —
        so these files also carry ${[...extra].sort().map(cellLabel).join(", ")}.
        Split them by donor with the WGS genotypes and the cell annotations from the
        analysis-ready set.</div>` : ""}
      <div class="scroller"><table class="ftable dl ddlibs">
        <thead><tr><th>Modality</th><th>Library holds</th><th>Files</th><th>Size</th>
          <th>Analysis set</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="ddfoot">Analysis-ready files are not listed here: each one spans the
        whole time course and every donor, so it cannot be cut to one sample —
        take those from the section above.</p>`;
  }

  function draw() { drawGrid(); drawOut(); }

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-k],[data-donor],[data-day],[data-t],#dd-all,#dd-none");
    if (!t) return;
    const toggle = (keys) => {
      const on = keys.every((k) => state.cells.has(k));
      keys.forEach((k) => on ? state.cells.delete(k) : state.cells.add(k));
    };
    if (t.dataset.k) toggle([t.dataset.k]);
    else if (t.dataset.donor)
      toggle(days.filter((dy) => has(t.dataset.donor, dy))
        .map((dy) => `${t.dataset.donor}:${dy}`));
    else if (t.dataset.day)
      toggle(donors.filter((dn) => has(dn, +t.dataset.day))
        .map((dn) => `${dn}:${t.dataset.day}`));
    else if (t.dataset.t) {
      const s = state.tiers;
      if (s.has(t.dataset.t)) s.delete(t.dataset.t); else s.add(t.dataset.t);
      if (!s.size) s.add(t.dataset.t);            // never empty
    } else if (t.id === "dd-all") cellFiles.forEach((_, k) => state.cells.add(k));
    else if (t.id === "dd-none") state.cells.clear();
    draw();
  });

  draw();
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
                "content_type", "file_format", "size_bytes", "md5sum",
                "download_url", "s3_uri"];
  return cols.join("\t") + "\n" + files.map((f) => [
    f.accession, f.tier, f.file_set, (f.donors || []).join(";"),
    (f.days || []).join(";"), f.content_type, f.file_format, f.size ?? "",
    f.md5 || "", f.download, f.s3_uri || "",
  ].join("\t")).join("\n") + "\n";
}

function renderBuilder(d, index) {
  const root = document.getElementById("builder");
  const cols = index.columns;
  const rec = (row) => Object.fromEntries(cols.map((c, i) => [c, row[i]]));
  const bySet = Object.fromEntries(
    Object.entries(index.sets).map(([k, rows]) => [k, rows.map(rec)]));

  const state = {
    set: d.sets[0].accession,
    tiers: new Set(["analysis-ready"]),
    types: new Set(),      // empty = all
    days: new Set(),       // empty = all
    donors: new Set(),     // empty = all
  };

  root.innerHTML = `
    <div class="builder">
      <div class="brow">
        <span class="blbl">Modality</span>
        <div class="chips" id="b-set"></div>
      </div>
      <div class="brow">
        <span class="blbl">Tier</span>
        <div class="chips" id="b-tier"></div>
      </div>
      <div class="brow">
        <span class="blbl">File type</span>
        <div class="chips" id="b-type"></div>
      </div>
      <div class="brow" id="b-day-row">
        <span class="blbl">Day</span>
        <div class="chips" id="b-day"></div>
      </div>
      <div class="brow" id="b-donor-row">
        <span class="blbl">Donor</span>
        <div class="chips" id="b-donor"></div>
      </div>
      <div class="bout" id="b-out"></div>
    </div>`;

  const chip = (label, on, key, sub = "") =>
    `<button class="chip ${on ? "on" : ""}" data-k="${esc(key)}">${esc(label)}${
      sub ? `<span>${esc(sub)}</span>` : ""}</button>`;

  function pool() {
    return bySet[state.set] || [];
  }

  /* Files matching everything except the given dimension, so each dimension's
     counts reflect the rest of the selection. */
  function match(f, skip) {
    if (skip !== "tier" && state.tiers.size && !state.tiers.has(f.tier)) return false;
    if (skip !== "type" && state.types.size && !state.types.has(f.content_type)) return false;
    // With both a donor and a day picked, match the pair the file actually
    // holds: a pooled Multiome library carries C29 and day 1, but its C29 is
    // day 0, so the cross product would hand back the wrong library.
    const pairwise = skip !== "day" && skip !== "donor" &&
                     state.days.size && state.donors.size;
    if (pairwise) {
      return (f.donor_days || []).some((k) => {
        const [dn, dy] = k.split(":");
        return state.donors.has(dn) && state.days.has(dy);
      });
    }
    if (skip !== "day" && state.days.size &&
        !(f.days || []).some((y) => state.days.has(String(y)))) return false;
    if (skip !== "donor" && state.donors.size &&
        !(f.donors || []).some((x) => state.donors.has(x))) return false;
    return true;
  }

  const selected = () => pool().filter((f) => match(f, null));

  function facet(key, value) {
    const t = {};
    for (const f of pool()) {
      if (!match(f, key)) continue;
      for (const v of value(f)) {
        const e = t[v] || (t[v] = { n: 0, b: 0 });
        e.n++;
        e.b += f.size || 0;
      }
    }
    return t;
  }

  function draw() {
    document.getElementById("b-set").innerHTML = d.sets.map((s) =>
      chip(s.label, state.set === s.accession, s.accession)).join("");

    const tiers = facet("tier", (f) => [f.tier]);
    document.getElementById("b-tier").innerHTML =
      ["analysis-ready", "processed", "raw"].filter((k) => tiers[k]).map((k) =>
        chip(TIER_LABEL[k], state.tiers.has(k), k,
             `${num(tiers[k].n)} · ${bytes(tiers[k].b)}`)).join("");

    const types = facet("type", (f) => [f.content_type]);
    document.getElementById("b-type").innerHTML =
      Object.keys(types).sort().map((k) =>
        chip(k, state.types.has(k), k,
             `${num(types[k].n)} · ${bytes(types[k].b)}`)).join("")
      || '<span class="muted">—</span>';

    // A principal set's files span the whole time course, so per-day and
    // per-donor filtering only means something for the upstream tiers.
    const upstream = [...state.tiers].some((t) => t !== "analysis-ready");
    const days = facet("day", (f) => (f.days || []).map(String));
    const dayKeys = upstream ? Object.keys(days).sort((a, b) => a - b) : [];
    document.getElementById("b-day-row").style.display = dayKeys.length ? "" : "none";
    document.getElementById("b-day").innerHTML =
      dayKeys.map((k) => chip("day " + k, state.days.has(k), k, num(days[k].n))).join("");

    const donors = facet("donor", (f) => f.donors || []);
    const donorKeys = upstream ? Object.keys(donors).sort() : [];
    document.getElementById("b-donor-row").style.display = donorKeys.length ? "" : "none";
    document.getElementById("b-donor").innerHTML =
      donorKeys.map((k) => chip(k, state.donors.has(k), k, num(donors[k].n))).join("");

    drawOut();
  }

  function drawOut() {
    const files = selected();
    const set = d.sets.find((s) => s.accession === state.set);
    const total = files.reduce((a, f) => a + (f.size || 0), 0);
    const title = [set.label,
                   [...state.tiers].map((t) => TIER_LABEL[t]).join(" + "),
                   state.types.size ? [...state.types].join(", ") : "all file types",
                   state.days.size ? "days " + [...state.days].join(", ") : null,
                   state.donors.size ? [...state.donors].join(", ") : null]
      .filter(Boolean).join(" · ");

    const mux = files.some((f) => f.mux);
    const out = document.getElementById("b-out");
    if (!files.length) {
      out.innerHTML = '<div class="bsum"><b>No files match</b>' +
        '<span>Widen the selection — tiers and file types are ANDed.</span></div>';
      return;
    }
    out.innerHTML = `
      <div class="bsum">
        <b>${num(files.length)} files · ${bytes(total)}</b>
        <span>${esc(title)}</span>
      </div>
      <div class="bacts">
        ${saveBtn(files.map((f) => f.download).join("\n") + "\n",
                  `igvf-${state.set}-urls.txt`, "↓ urls.txt")}
        ${saveBtn(curlScript(files, title), `igvf-${state.set}-curl.sh`, "↓ curl script")}
        ${saveBtn(awsScript(files, title), `igvf-${state.set}-aws.sh`, "↓ aws s3 script")}
        ${saveBtn(manifestTsv(files), `igvf-${state.set}-manifest.tsv`, "↓ manifest.tsv")}
        ${copyBtn(files.map((f) => f.download).join("\n"), "Copy URLs")}
        ${copyBtn(files.map((f) => f.s3_uri).filter(Boolean).join("\n"), "Copy S3 URIs")}
      </div>
      ${mux ? `<div class="bnote">Some selected files come from genetically
        multiplexed libraries — one file holds four donors sampled on four
        different reprogramming days, so it cannot be narrowed to a single donor
        or day before demultiplexing with the WGS VCF and the cell
        annotations.</div>` : ""}
      ${codeBlock(`# after saving urls.txt next to this shell\nxargs -n1 -P4 curl -fL -C - -O --retry 3 < igvf-${state.set}-urls.txt`,
                  "download in four parallel streams")}
      <details class="bfiles">
        <summary>${num(files.length)} files</summary>
        <div class="scroller"><table class="ftable">
          <thead><tr><th>Accession</th><th>Tier</th><th>File type</th><th>Format</th>
            <th>Size</th><th>Set</th><th></th></tr></thead>
          <tbody>${files.slice(0, 400).map((f) => `<tr>
            <td class="acc"><a href="${esc(f.download)}">${esc(f.accession)}</a></td>
            <td>${esc(TIER_LABEL[f.tier])}</td>
            <td class="ct">${esc(f.content_type)}</td>
            <td><span class="fmt">${esc(f.file_format)}</span></td>
            <td class="sz">${bytes(f.size)}</td>
            <td class="acc">${esc(f.file_set)}</td>
            <td class="act"><a class="dbtn" href="${esc(f.download)}">↓</a></td>
          </tr>`).join("")}</tbody>
        </table></div>
        ${files.length > 400 ? `<p class="muted">Showing the first 400 of
          ${num(files.length)}; the manifest and scripts include all of them.</p>` : ""}
      </details>`;
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const k = b.dataset.k;
    const group = b.closest(".chips").id;
    if (group === "b-set") {
      state.set = k;
      state.types.clear(); state.days.clear(); state.donors.clear();
    } else {
      const s = { "b-tier": state.tiers, "b-type": state.types,
                  "b-day": state.days, "b-donor": state.donors }[group];
      if (s.has(k)) s.delete(k); else s.add(k);
      if (group === "b-tier") {
        if (!state.tiers.size) state.tiers.add(k);   // never empty
        state.types.clear();
        if (![...state.tiers].some((t) => t !== "analysis-ready")) {
          state.days.clear();                        // filters just hidden
          state.donors.clear();
        }
      }
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
  renderDonorDays(d, index);
  renderBulk(d);
  renderBuilder(d, index);
  document.getElementById("gen-date").textContent = d.generated;
}).catch((e) => {
  console.error(e);
  document.getElementById("tiers").innerHTML =
    '<div class="note">Could not load <code>data/*.json</code>. ' +
    'If you opened this file directly, serve it instead: <code>python3 -m http.server</code></div>';
});
