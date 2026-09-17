#!/usr/bin/env python3
"""Parse Figure 1's legend out of the manuscript PDF into data/figures.json.

The page shows Figure 1 only, so that is all this extracts. The short "what
this shows" blurb is authored here; the full legend is lifted verbatim from the
manuscript so it stays in sync when the draft is updated.
"""
import json, os, re, sys
from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, os.pardir, os.pardir, "manuscript", "pdf",
                   "pgp_lines_manuscript.pdf")
OUT = os.path.join(HERE, os.pardir, "data", "figures.json")

BLURB = {
    "1": "Four donor fibroblast lines tracked to iPSC across up to 11 time points "
         "with four single-cell modalities, unified under one cell-state annotation.",
}


def clean(t):
    t = re.sub(r"\n(?!===== PAGE)", " ", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t


def main():
    reader = PdfReader(PDF)
    text = clean("\n".join((p.extract_text() or "") for p in reader.pages))

    # Legends run from a "Figure N." / "Figure N:" heading to the next one.
    # The manuscript mixes both punctuations, so accept either.
    heads = list(re.finditer(r"Figure (S?\d+)[.:]\s", text))
    # Keep only the legend block (the last contiguous run of headings).
    legends = {}
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        body = text[m.end():end].strip()
        body = re.sub(r"\s*Supplemental Legends\s*$", "", body)
        body = re.sub(r"\s+", " ", body)
        if len(body) < 120:          # cross-reference, not a legend
            continue
        key = m.group(1)
        if key not in legends or len(body) > len(legends[key]):
            legends[key] = body

    def entry(num):
        body = legends.get(num, "")
        title, rest = body, ""
        mm = re.match(r"(.{10,180}?[.])\s+(\(?[A-Z][),.]|\(A\))", body)
        if mm:
            title, rest = mm.group(1).rstrip("."), body[mm.end(1):].strip()
        return {
            "id": ("fig" + num) if not num.startswith("S") else ("fig" + num),
            "number": num,
            "title": title,
            "legend": rest or body,
            "blurb": BLURB.get(num, ""),
        }

    payload = {"figure": entry("1")}
    with open(OUT, "w") as fh:
        json.dump(payload, fh, indent=2)
    sys.stderr.write(f"wrote {OUT}\n  {payload['figure']['title'][:80]}\n")


if __name__ == "__main__":
    main()
