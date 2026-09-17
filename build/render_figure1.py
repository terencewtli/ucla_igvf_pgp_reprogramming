#!/usr/bin/env python3
"""Rasterise Figure 1 from the manuscript PDF into the two PNGs the page uses.

    figures/fig1.png       full resolution (~5,200 px wide, ~360 DPI at letter)
    figures/fig1-web.png   2,400 px wide, shown inline

PNG rather than JPEG: the panels are line art, text and scatter points, where
JPEG ringing is visible at the zoom levels reviewers actually use.

`sips` renders the PDF page; ImageMagick trims the page margins; the block pass
below drops the isolated "Figure 1" page label, which sits far below the artwork
and would otherwise leave a tall band of whitespace under it.

Needs: sips (macOS), ImageMagick, Pillow, NumPy.
Run:   python3 build/render_figure1.py
"""
import glob, os, subprocess, sys
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, os.pardir, os.pardir, "manuscript", "pdf")
DST = os.path.join(HERE, os.pardir, "figures")
RENDER_WIDTH = 6000   # px wide off the PDF, before margins are trimmed
WEB_WIDTH = 2400      # px wide for the inline render
INK = 247             # below this grey value counts as ink
MIN_FRAC = 0.0015     # a row/column must be this non-white to count as content


def source_pdf():
    hits = sorted(glob.glob(os.path.join(SRC_DIR, "Figure1*.pdf")))
    if not hits:
        sys.exit(f"no Figure1*.pdf in {os.path.normpath(SRC_DIR)}")
    return hits[-1]  # latest revision, filenames carry a date suffix


def content_box(a):
    """Bounding box of the main artwork block, excluding detached page labels."""
    rows = np.flatnonzero((a < INK).mean(axis=1) > MIN_FRAC)
    if not rows.size:
        sys.exit("rendered page is blank")

    # Group content rows into blocks separated by >3% of page height of white.
    gap = max(20, int(0.03 * a.shape[0]))
    blocks, start, prev = [], rows[0], rows[0]
    for i in rows[1:]:
        if i - prev > gap:
            blocks.append((start, prev))
            start = i
        prev = i
    blocks.append((start, prev))

    # Keep the tallest block plus anything within one gap below it.
    top, bot = max(blocks, key=lambda b: b[1] - b[0])
    for b in blocks:
        if bot <= b[0] <= bot + gap:
            bot = max(bot, b[1])

    cols = np.flatnonzero((a[top:bot + 1] < INK).mean(axis=0) > MIN_FRAC)
    left, right = (cols[0], cols[-1]) if cols.size else (0, a.shape[1] - 1)
    pad = 12
    return (max(0, left - pad), max(0, top - pad),
            min(a.shape[1], right + 1 + pad), min(a.shape[0], bot + 1 + pad))


def main():
    pdf = source_pdf()
    os.makedirs(DST, exist_ok=True)
    raw = os.path.join(DST, ".fig1-raw.png")
    full = os.path.join(DST, "fig1.png")
    web = os.path.join(DST, "fig1-web.png")

    sys.stderr.write(f"source {os.path.basename(pdf)}\n")
    subprocess.run(["sips", "-s", "format", "png",
                    "--resampleWidth", str(RENDER_WIDTH), pdf, "--out", raw],
                   check=True, stdout=subprocess.DEVNULL)
    # Flatten transparency onto white and drop the page margins.
    subprocess.run(["magick", raw, "-background", "white", "-alpha", "remove",
                    "-alpha", "off", "-trim", "+repage", raw], check=True)

    im = Image.open(raw)
    box = content_box(np.asarray(im.convert("L")))
    art = im.convert("RGB").crop(box)
    art.save(full, optimize=True)
    art.resize((WEB_WIDTH, round(art.height * WEB_WIDTH / art.width)),
               Image.LANCZOS).save(web, optimize=True)
    os.remove(raw)

    for p in (full, web):
        w, h = Image.open(p).size
        sys.stderr.write(f"{os.path.relpath(p, os.path.join(HERE, os.pardir))}: "
                         f"{w}x{h}, {os.path.getsize(p) / 1e6:.1f} MB\n")


if __name__ == "__main__":
    main()
