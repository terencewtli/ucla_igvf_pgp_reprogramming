# Archived page sections

Parts of the landing page removed to keep it focused on data download. Nothing
is lost: the full page is intact at commit **`0984cf7`** ("Point the README at
the pages.dev URL"), the last commit before the cut.

## Removed 2026-09-17

| Section | Where it lived at `0984cf7` |
|---|---|
| **Summary key points** — four numbered findings under the summary paragraph; the paragraph itself was rewritten to describe only the experiment | `index.html` (`<ol class="keypoints">`), CSS `.keypoints` |
| **"Figure 1" heading and "Click the figure for the full-resolution PNG."** — the figure now sits directly under the summary, still linking to the full PNG | `index.html` (`<section id="figure">`), nav link `#figure` |
| **Figure caption and legend** — "FIGURE 1" tag, title, blurb, collapsible full legend, "Download full PNG" line | `js/app.js` `renderFigure()`, CSS `.figmeta`, data from `data/figures.json` |
| **"Which donor is in which assay"** — donor × modality matrix with efficiency pills, mapping portal accessions to C29/C37/C38/C39 | `index.html` (`#matrix`), `js/app.js` `renderMatrix()`, CSS `.matrix`, `.pill` |
| **Recipes** — six shell snippets: one file, one type live from the portal, S3, md5 verification, walking the tiers via the JSON API, the whole study | `index.html` (`#recipes`), `js/app.js` `renderRecipes()`, CSS `.recipes`, `.recipe` |

## Removed 2026-09-17, second pass

Starting point: commit **`e0c5df4`**.

| Section | Where it lived at `e0c5df4` |
|---|---|
| **Genome browser button** (pending) in the hero | `index.html` `.links` |
| **Page notes**: genotype demultiplexing, Multiome libraries pooled across time points, cross-modal pseudobulk sets in preparation. The spatial-set note stays. | `js/app.js` `renderNotes()` |
| **Download intro**: "Direct links, one file at a time or a whole tier at once… no credentials." | `index.html` `#download .sec-head` |
| **Heading/intro wording**: "Start here — analysis-ready files" became "Analysis-ready files"; "Whole-tier pulls." and "— either live from the portal or as a static copy shipped with this page." were cut from the processed/raw intro | `index.html` |

The multiplexing caveat still appears in the download builder when a selection
includes multiplexed Multiome files.

`build/extract_legends.py` and `data/figures.json` are kept but the page no
longer reads them. `data/filesets.json` still carries `donor_meta`, though the page no longer
shows it.

## Removed 2026-09-17, third pass

Starting point: commit **`4ab8e8d`**.

| Section | Where it lived at `4ab8e8d` |
|---|---|
| **Note on the spatial set**: IGVFDS6501PVZQ bundles two pilot runs and the main run (C29, C38); donor A8 is from the pilots only. This was the last page note, so the notes slot is gone too. | `js/app.js` `renderNotes()`, `index.html` `#notes` |

## Restoring

Use `0984cf7` for the first pass, `e0c5df4` for the second and `4ab8e8d` for the third. View the old page:

```bash
git show 0984cf7:index.html      # or js/app.js, css/style.css
```

Bring a section back by copying its block from those files, or restore all three
files wholesale:

```bash
git checkout 0984cf7 -- index.html js/app.js css/style.css
```
