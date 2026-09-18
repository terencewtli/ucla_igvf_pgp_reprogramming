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

/* ------------------------------------------------------------ page notes */
function renderNotes(d) {
  const spatial = d.sets.find((s) => s.accession === "IGVFDS6501PVZQ");
  const extra = Object.values(d.donor_meta)
    .filter((m) => m.efficiency === "not in manuscript").map((m) => m.name);

  const bits = [];
  if (extra.length && spatial) {
    bits.push(`<div class="note"><b>Note on the spatial set.</b> ${esc(spatial.accession)}
      bundles three experiments: two pilot runs used for orthogonal validation and the
      main run reported in the manuscript (donors C29 and C38). Donor
      ${extra.map(esc).join(", ")} appears in the set's metadata because of the pilot
      runs only, and is not a manuscript line.</div>`);
  }
  document.getElementById("notes").innerHTML = bits.join("");
}

/* ------------------------------------------------------------------- boot */
Promise.all([
  fetch("data/filesets.json").then((r) => r.json()),
  fetch("data/files.json").then((r) => r.json()),
]).then(([d, index]) => {
  renderFigure();
  renderTiers(d);
  renderNotes(d);
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
