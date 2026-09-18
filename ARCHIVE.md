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

`build/extract_legends.py` and `data/figures.json` are kept but the page no
longer reads them. `data/filesets.json` still carries `donor_meta`, which the
spatial-set note uses.

## Restoring

View the old page:

```bash
git show 0984cf7:index.html      # or js/app.js, css/style.css
```

Bring a section back by copying its block from those files, or restore all three
files wholesale:

```bash
git checkout 0984cf7 -- index.html js/app.js css/style.css
```
