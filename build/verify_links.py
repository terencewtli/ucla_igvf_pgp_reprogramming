#!/usr/bin/env python3
"""Check the portal URLs the page hands out.

Three kinds of check:
  * every search URL still resolves to the count the page displays;
  * every metadata manifest URL still returns a TSV with that many rows, with
    the 'File download URL' column the copy-command buttons cut on;
  * a sample of direct @@download URLs still serves bytes.

Exit status is the number of mismatches, so it works in CI.
"""
import json, os, random, sys, urllib.request

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, os.pardir, "data", "filesets.json")


def total(url):
    api = url.replace("https://data.igvf.org/", "https://api.data.igvf.org/")
    req = urllib.request.Request(api + "&format=json&limit=0",
                                 headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60)).get("total")
    except Exception as e:
        return f"ERR {e}"


def manifest_rows(url):
    """(row count, has the download-URL column) for a metadata TSV endpoint."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        body = urllib.request.urlopen(req, timeout=120).read().decode()
    except Exception as e:
        return f"ERR {e}", False
    lines = [l for l in body.splitlines() if l.strip()]
    if len(lines) < 2:
        return 0, False
    header = lines[1].split("\t")          # line 1 is a '# Source URL:' comment
    return len(lines) - 2, "File download URL" in header


def serves_bytes(url):
    """True if the @@download URL hands over the first bytes of the file."""
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Range": "bytes=0-63"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status in (200, 206) and len(r.read(64)) > 0
    except Exception:
        return False


def main():
    d = json.load(open(DATA))
    checks = fails = 0

    def check(label, url, expect):
        nonlocal checks, fails
        got = total(url)
        checks += 1
        if got != expect:
            fails += 1
            print(f"  MISMATCH {label}: expect {expect}, got {got}")

    for s in d["sets"]:
        for key in ("measurement", "intermediate"):
            t = s[key]
            check(f"{s['label']}/{key}/files", t["files_search"], t["n_files"])
            check(f"{s['label']}/{key}/sets", t["sets_search"], t["n_sets"])
            for ty in t["types"]:
                check(f"{s['label']}/{key}/{ty['content_type']}",
                      ty["search"], ty["n"])
        check(f"{s['label']}/final/files", s["files_search"], len(s["files"]))

    def check_manifest(label, url, expect):
        nonlocal checks, fails
        got, has_col = manifest_rows(url)
        checks += 1
        if got != expect or not has_col:
            fails += 1
            print(f"  MISMATCH manifest {label}: expect {expect} rows, got {got}"
                  f"{'' if has_col else ', missing File download URL column'}")

    for s in d["sets"]:
        check_manifest(f"{s['label']}/final", s["manifest"], len(s["files"]))
        for key in ("measurement", "intermediate"):
            check_manifest(f"{s['label']}/{key}", s[key]["manifest"],
                           s[key]["n_files"])

    # Sampled, because the study is 1,813 files: enough to catch a changed
    # download route, cheap enough to run on every build.
    index = json.load(open(os.path.join(HERE, os.pardir, "data", "files.json")))
    cols = index["columns"]
    rows = [dict(zip(cols, r)) for rs in index["sets"].values() for r in rs]
    random.seed(0)
    sample = ([r for r in rows if r["tier"] == "analysis-ready"][:6]
              + random.sample(rows, 9))
    for r in sample:
        checks += 1
        if not serves_bytes(r["download"]):
            fails += 1
            print(f"  MISMATCH download {r['accession']}: {r['download']}")

    tot = d["totals"]
    check("totals/raw", tot["search"]["measurement"],
          sum(s["measurement"]["n_files"] for s in d["sets"]))
    check("totals/processed", tot["search"]["intermediate"],
          sum(s["intermediate"]["n_files"] for s in d["sets"]))
    check("totals/final", tot["search"]["principal"],
          sum(len(s["files"]) for s in d["sets"]))
    check("totals/all", tot["search"]["all"], tot["files"])

    print(f"{checks} URL checks, {fails} mismatches")
    return fails


if __name__ == "__main__":
    sys.exit(min(main(), 255))
