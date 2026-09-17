#!/usr/bin/env python3
"""Rasterise Figure 1 from the manuscript PDF into the PNGs the page uses.

    figures/fig1.png        full render, ~5,860 px wide (800 DPI at letter width)
    figures/fig1-3200.png   for 2x displays
    figures/fig1-2400.png
    figures/fig1-1600.png   for 1x displays and phones

PNG rather than JPEG: the panels are line art, text and scatter points, where
JPEG ringing shows at the zoom levels reviewers actually use.

**Render with PyMuPDF, not sips.** `sips -s format png --resampleWidth N` on a
PDF rasterises the page at a low fixed resolution and then upscales, so its
output is equally blurry at 3,000 px and 9,000 px — Figure 1's labels are vector
text in the PDF and came out mush. PyMuPDF renders at the requested DPI, so the
text is sharp.

800 DPI is chosen against the figure's own contents: the panels are embedded
rasters at 717-1298 DPI effective resolution (the six culture-dish cartoons in
panel A are only 297 DPI), so rendering much above 800 buys file size and no
detail. Sharpening those cartoons would mean re-exporting Figure 1 upstream.

The block pass below drops the isolated "Figure 1" page label, which sits far
below the artwork and would otherwise leave a tall band of whitespace.

Needs: PyMuPDF, Pillow, NumPy.
Run:   python3 build/render_figure1.py
"""
import glob, os, sys
import numpy as np
import pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, os.pardir, os.pardir, "manuscript", "pdf")
DST = os.path.join(HERE, os.pardir, "figures")
DPI = 800
WEB_WIDTHS = (1600, 2400, 3200)
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
    pad = round(DPI / 66)   # ~12 px at 800 DPI
    return (max(0, left - pad), max(0, top - pad),
            min(a.shape[1], right + 1 + pad), min(a.shape[0], bot + 1 + pad))


def main():
    pdf = source_pdf()
    os.makedirs(DST, exist_ok=True)
    sys.stderr.write(f"source {os.path.basename(pdf)} at {DPI} DPI\n")

    pix = pymupdf.open(pdf)[0].get_pixmap(dpi=DPI, alpha=False)
    page = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    art = page.crop(content_box(np.asarray(page.convert("L"))))

    written = [os.path.join(DST, "fig1.png")]
    art.save(written[0], optimize=True)
    for w in WEB_WIDTHS:
        p = os.path.join(DST, f"fig1-{w}.png")
        art.resize((w, round(art.height * w / art.width)),
                   Image.LANCZOS).save(p, optimize=True)
        written.append(p)

    for p in written:
        w, h = Image.open(p).size
        sys.stderr.write(f"{os.path.relpath(p, os.path.join(HERE, os.pardir))}: "
                         f"{w}x{h}, {os.path.getsize(p) / 1e6:.1f} MB\n")
    sys.stderr.write("remember: index.html hard-codes fig1's width/height\n")


if __name__ == "__main__":
    main()
