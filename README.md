# Landing page — *Epigenomic heterogeneity and spatial organization during human reprogramming*

Live: <https://ucla-igvf-pgp-reprogramming.pages.dev>

Static site. No build step, no framework: `index.html` + `css/style.css` + `js/app.js`,
with all content driven by generated JSON. Light theme only, Arial throughout
(`--sans`) with a monospace stack (`--mono`) for code, accessions and paths —
there is no third family, so headings are Arial too.

## Layout

```
index.html              page shell
css/style.css           all styling
js/app.js               renders the faceted browser (the main tool), plus the
                        figure, data tiers and the download tables
img/                    UCLA and IGVF logos (trimmed from ../misc/)
figures/fig1.png        Figure 1A, full render, 6,669 px wide (800 DPI)
figures/fig1-{1600,2400,3200}.png   responsive set used inline
data/filesets.json      generated — IGVF portal crawl
data/files.json         generated — flat index of all 1,813 files
data/manifests/*.tsv    generated — download manifests, per set per tier
data/figures.json       generated — Figure 1's legend (no longer shown; see ARCHIVE.md)
build/                  the generators (see below)
```

## Regenerating

Run from this directory. Each script is independent.

```bash
# 1. Re-crawl the IGVF portal (5 principal -> 90 intermediate -> 100 measurement
#    sets) and write filesets.json, files.json and data/manifests/*.tsv.
#    Responses are cached in build/.cache; delete it to force a fresh pull.
python3 build/fetch_igvf.py

# 2. Re-render the header figure from ../manuscript/pdf/fig1a_small.pdf to PNG
#    (needs PyMuPDF, Pillow, NumPy — NOT sips, see the script's docstring)
python3 build/render_figure1.py

# 3. Confirm the portal URLs the page hands out still work
python3 build/verify_links.py
```

`verify_links.py` exits non-zero on any mismatch, so it can gate a deploy. It
checks three things: every search URL resolves to the count shown on the page,
every metadata manifest returns that many rows with the `File download URL`
column the copy-command buttons cut on, and a sample of `@@download` URLs still serves bytes.
It is the check to run if the IGVF portal changes its search or download routes.

## Editing the page by hand

Prose lives in `index.html` — the summary, each section's heading and intro
paragraph, and which sections start folded open (`<details class="fold" open>`).
Edit it directly; there is no templating.

Anything that reports a number, a file or an accession is generated in
`js/app.js` from `data/*.json`, so edit the renderer (or the `BLURB`/note text
inside it), not the JSON, which `build/fetch_igvf.py` overwrites.

Sections cut to declutter the page (summary key points, figure legend, donor
matrix, download recipes, page notes) are listed in `ARCHIVE.md` with how to restore them.

Then `git commit && git push` — Cloudflare redeploys within about ten seconds.

## The header figure

The page shows **panel A alone** (`fig1a_small.pdf`), a 3.4:1 schematic that sits
above the fold without pushing the download tool off the screen. `SOURCE` and
`DROP_DETACHED` at the top of `build/render_figure1.py` switch back to the whole
figure; `js/app.js` hard-codes the rendered aspect in `renderFigure()`, so update
`width`/`height` there if the source changes.

`DROP_DETACHED` is off for panel A and must stay off: the block pass it controls
exists to drop the full figure's detached "Figure 1" label, and panel A is two
horizontal bands with white between them — exactly what that pass would mistake
for a label and crop away.

The ceiling is the PDF, not the render. The artwork is embedded raster at
717-1298 DPI effective resolution, but the culture-dish cartoons are only
190x109 px (297 DPI as placed). No rendering setting sharpens those — they need
re-exporting upstream. The labels are vector text and are sharp.

## How downloads work

Every file record carries `https://api.data.igvf.org/<type>/<accession>/@@download/<name>`,
which 307s to a presigned URL on the public `igvf-public` S3 bucket. No login, no
access request, and resumable with `curl -C -`. Two things to know:

* `data.igvf.org` (the UI host) refuses `@@download`; only `api.data.igvf.org` serves it.
* The portal's `/metadata/?type=AnalysisSet&…` endpoint returns the same rows as our
  static manifests but regenerated on request, so it picks up newly released files.
  It accepts `accession=`, `input_for=` and `files.content_type=` filters. It sends no
  CORS headers, which is why the page ships static manifests and a local file index
  instead of querying it from the browser.

The 10x Multiome libraries are genetically multiplexed: **one library pools four
donors sampled on four different reprogramming days**, so its files cannot be
split by donor or day before demultiplexing with the WGS VCF. snmCT-seq,
sn-m3C-seq and WGS are one donor and one day per library; the spatial slides are
pooled sections at one day. `build/fetch_igvf.py` derives this from the portal's
own sample summaries — see `donor_days()`.

## The faceted browser

"Get the data" (`renderBuilder` in `js/app.js`) is the page's centrepiece and its
first section: filters down the left, a donor x reprogramming-day matrix and the
result on the right, after the ENCODE matrix pages. Four dimensions —
**sample x modality x tier x file type** — each optional, each empty meaning all,
every facet term carrying the count it would yield. The result is a URL list, a
curl or aws script, or a manifest, built in the browser.

Everything else on the page folds away (`<details class="fold">`), so the page
opens on the tool rather than on prose. Summary is open by default; the tier
table, the analysis-ready list and the by-type manifests start closed.

The sample axis keys on **(donor, day) pairs, not the cross product** of a file's
donor and day lists. The distinction only matters for the Multiome libraries, and
there it matters completely: `IGVFDS3826NTFN` carries C29, C37, C38 and C39 *and*
days 0, 1, 3 and 5, but what it holds is C29 at day 0, C37 at day 1, C38 at day 3
and C39 at day 5. Crossing the two lists would offer it for twelve samples it does
not contain. The pairs come from `describe_group()` as `donor_day_keys`, and ride
on every file record as the `donor_days` column of `files.json` and of the
manifest TSVs.

Three rules the UI states on screen rather than hiding:

* Selecting one donor-day of a pooled Multiome library still downloads the whole
  library, so the panel lists what else is in it and links the WGS genotypes.
* **Analysis-ready files are never cut by sample.** Each is one matrix over the
  whole study, so the sample filter does not apply to them; they join a selection
  whole, and the panel says so. This is why the browser opens on the Processed
  tier — opening on analysis-ready would show a matrix of dashes.
* The matrix shows only the four manuscript lines. A8 is excluded — not a
  manuscript line, pilot spatial runs only, one time point, so it would add a
  near-empty row and a day-30 column of its own. `DONOR_NOTES` in
  `fetch_igvf.py` decides this via the `in_manuscript` flag on each donor;
  A8's files stay reachable from the by-type section.

## Preview locally

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765
```

Opening `index.html` via `file://` will not work — the page fetches `data/*.json`.

## Deploying

Hosted on **Cloudflare Pages**, connected to this GitHub repo: **every push to
`main` triggers a redeploy**, no build command, output directory `/`. The whole
repo root is uploaded, `build/` and this README included, so treat anything
committed here as public.

A Cloudflare *Workers* project for the same repo also existed briefly at
`ucla-igvf-pgp-reprogramming.terencewtli.workers.dev` — Cloudflare defaults new
Git connections to Workers, whose hostnames carry the account subdomain. Pages
gives the shorter `*.pages.dev`. Delete the Worker project if it is still there,
so there is only one live copy to keep in sync.

The site is public and indexable, which is intended — it goes up alongside the
preprint.

It is plain static files with relative paths, so it runs unchanged anywhere else:
GitHub Pages on this repo (**Settings → Pages → Deploy from branch → `main` /
`/` (root)**; `.nojekyll` is already present), Netlify, or a lab web server. Only
the URL changes — and the URL cited in the preprint is the one thing here worth
choosing for the long term, since a custom domain is what would let the address
survive a change of host.

## Still to fill in

- The `Preprint` button in `index.html` is marked `aria-disabled="true"` and
  renders as "pending" — remove that attribute and set the real `href` when it
  is available. (Genome browser, Spatial explorer and Code buttons were dropped.)
- Decide whether to host the manuscript PDF here (not copied in by default).
- The 14 cross-modal pseudobulk sets are not yet released; once they are,
  `fetch_igvf.py` will pick them up.
- The spatial slides carry the portal's induction days (6, 13 and 30 days for the
  pilots); the manuscript describes the in situ timepoints differently. Worth
  reconciling before the preprint, since the page now shows the portal's numbers.
