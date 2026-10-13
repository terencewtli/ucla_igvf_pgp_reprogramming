#!/usr/bin/env python3
"""Fetch the cross-modal pseudobulk sets and emit the page's pseudobulk table.

The 14 pseudobulk sets sit downstream of the Multiome, snmCT-seq and sn-m3C-seq
principal sets: fetch_igvf.py finds them through input_for and lists them in
filesets.json under "downstream". This script reads that list, so run
fetch_igvf.py first.

Until the sets are released the portal answers 403 to anyone anonymous -- for
the set, its files and their metadata alike -- so describing them takes portal
access keys:

    export IGVF_API_KEY=...  IGVF_SECRET_KEY=...
    python3 build/fetch_pseudobulk.py

The keys are read from the environment and never written anywhere. Each set is
also probed without them, which is what decides "released" on the page: the
build flips a set to public on the first run after the portal does.

Run without keys and nothing is lost. Whatever the anonymous crawl cannot read
is carried over from the existing data/pseudobulk.json, and only the released
flags are refreshed.

Outputs (under site/data/):
    pseudobulk.json            one record per set, files included
    manifests/pseudobulk.tsv   one row per file

Everything written here is public once pushed: file names, sizes and md5s of
unreleased files included. s3_uri is left out until release, since it points at
the private bucket and changes when the file moves to the public one.
"""
import base64, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

API = "https://api.data.igvf.org"
PORTAL = "https://data.igvf.org"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, os.pardir, "data")
FILESETS = os.path.join(DATA, "filesets.json")
OUT = os.path.join(DATA, "pseudobulk.json")
OUT_TSV = os.path.join(DATA, "manifests", "pseudobulk.tsv")

# Row order on the page, by the lab's alias code (pgp_<code>_pseudobulk).
# Hand-set: the pooled states first, the per-donor starting fibroblasts last.
# A code not listed here sorts to the end.
ORDER = ["start", "sendai", "skin", "inflamed", "delayed", "fail1",
         "inter1", "inter2", "fail2", "ips",
         "start_C29", "start_C37", "start_C38", "start_C39"]

# Names shown on the page where the lab's file names say something else.
# Display only: the files themselves are still IPS.bam and so on.
RENAME = {"ips": "early-iPSC"}

# Column order on the page.
TYPES = ["alignments", "ATAC-seq signal", "methylation counts",
         "contact matrix", "chromatin conformation compartments",
         "topologically associating domains", "chromatin conformation loops"]

CODE_RE = re.compile(r"pgp_(.+)_pseudobulk$")
SAMPLE_RE = re.compile(r"(C\d+)_day(\d+)")


def get(path, auth=None):
    """Uncached GET -> (http status, record or None). Nothing here is cached on
    disk: a cached 403 would hide the release this script watches for, and a
    cached authenticated record would outlive the keys that fetched it."""
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if auth:
        headers["Authorization"] = "Basic " + auth
    req = urllib.request.Request(f"{API}{path}?format=json", headers=headers)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                return e.code, None
            time.sleep(1.5 * (attempt + 1))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None, None


def alias_of(rec):
    for a in rec.get("aliases", []) or []:
        return a.split(":", 1)[-1]
    return None


def describe(rec, sources):
    """One pseudobulk set as the page shows it."""
    alias = alias_of(rec) or rec.get("accession")
    m = CODE_RE.search(alias or "")
    code = m.group(1) if m else alias

    files = []
    for f in rec.get("files", []) or []:
        if not isinstance(f, dict) or not f.get("href"):
            continue
        files.append({
            "accession": f.get("accession"),
            "content_type": f.get("content_type"),
            "file_format": f.get("file_format"),
            "size": f.get("file_size"),
            "md5": f.get("md5sum"),
            "href": f.get("@id"),
            "download": API + f["href"],
            "s3_uri": f.get("s3_uri") if f.get("status") == "released" else None,
            "summary": f.get("summary"),
            "assembly": f.get("assembly"),
            "filename": os.path.basename(f.get("submitted_file_name") or ""),
            "status": f.get("status"),
        })
    files.sort(key=lambda f: (TYPES.index(f["content_type"])
                              if f["content_type"] in TYPES else len(TYPES),
                              f["accession"] or ""))

    # The name the lab's own files carry: Start.bam, Start_tads.bed -> "Start".
    names = [f["filename"] for f in files if f["filename"]]
    name = os.path.commonprefix(names).rstrip("._-") if names else ""

    # Which samples the state draws cells from, by the lab's sample aliases
    # (C29_day12, C29_day0_primary).
    pairs = set()
    for s in rec.get("samples", []) or []:
        sm = SAMPLE_RE.search(alias_of(s) or "") if isinstance(s, dict) else None
        if sm:
            pairs.add((sm.group(1), int(sm.group(2))))
    pairs = sorted(pairs)

    return {
        "accession": rec.get("accession"),
        "alias": alias,
        "code": code,
        "name": name or code,
        "qualifier": rec.get("cell_qualifier"),
        "cell_type": (rec.get("cell_type") or {}).get("term_name"),
        "summary": rec.get("summary"),
        "assays": rec.get("preferred_assay_titles") or [],
        "workflows": [w.get("name") for w in rec.get("workflows", []) or []
                      if isinstance(w, dict)],
        "from": sources,
        "donors": sorted({p[0] for p in pairs}),
        "days": sorted({p[1] for p in pairs}),
        "donor_days": [f"{d}:{y}" for d, y in pairs],
        "status": rec.get("status"),
        "portal": f"{PORTAL}/pseudobulk-sets/{rec.get('accession')}/",
        "files": files,
        "bytes": sum(f["size"] or 0 for f in files),
    }


def main():
    if not os.path.exists(FILESETS):
        sys.exit("data/filesets.json not found -- run build/fetch_igvf.py first")
    with open(FILESETS) as fh:
        downstream = json.load(fh).get("downstream", [])
    if not downstream:
        sys.exit("filesets.json lists no downstream sets -- nothing to do")

    key, secret = os.environ.get("IGVF_API_KEY"), os.environ.get("IGVF_SECRET_KEY")
    auth = (base64.b64encode(f"{key}:{secret}".encode()).decode()
            if key and secret else None)

    previous = {}
    if os.path.exists(OUT):
        with open(OUT) as fh:
            previous = {s["accession"]: s for s in json.load(fh).get("sets", [])}

    def one(ds):
        anon_code, rec = get(ds["id"])
        code = anon_code
        if not rec and auth:
            code, rec = get(ds["id"], auth)
        return ds, anon_code, code, rec

    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(one, downstream))

    sets, kept, failed = [], [], []
    for ds, anon_code, code, rec in results:
        if rec:
            s = describe(rec, ds["from"])
        elif ds["accession"] in previous:
            s = previous[ds["accession"]]
            kept.append(ds["accession"])
        else:
            failed.append(f"{ds['accession']} (http {code})")
            continue
        # Public means the portal serves the record to an anonymous request,
        # whatever the status field says.
        s["name"] = RENAME.get(s["code"], s["name"])
        s["released"] = anon_code == 200
        s["http_anonymous"] = anon_code
        sets.append(s)

    if failed:
        sys.stderr.write("could not read, and no earlier copy to keep: "
                         + ", ".join(failed) + "\n")
        if not auth:
            sys.stderr.write("set IGVF_API_KEY and IGVF_SECRET_KEY to read "
                             "unreleased sets\n")
        elif any("401" in f for f in failed):
            sys.stderr.write("the portal rejected these access keys (401)\n")
    if not sets:
        sys.exit(1)

    sets.sort(key=lambda s: (ORDER.index(s["code"]) if s["code"] in ORDER
                             else len(ORDER), s["code"] or ""))

    tally = {}
    for s in sets:
        for f in s["files"]:
            e = tally.setdefault(f["content_type"], {
                "content_type": f["content_type"], "formats": set(),
                "n": 0, "bytes": 0})
            e["n"] += 1
            e["bytes"] += f["size"] or 0
            if f["file_format"]:
                e["formats"].add(f["file_format"])
    types = [{"content_type": e["content_type"],
              "file_format": "/".join(sorted(e["formats"])),
              "n": e["n"], "bytes": e["bytes"]}
             for e in sorted(tally.values(),
                             key=lambda e: (TYPES.index(e["content_type"])
                                            if e["content_type"] in TYPES
                                            else len(TYPES)))]

    payload = {
        "generated": time.strftime("%Y-%m-%d"),
        "n_files": sum(len(s["files"]) for s in sets),
        "bytes": sum(s["bytes"] for s in sets),
        "n_released": sum(1 for s in sets if s["released"]),
        "types": types,
        "sets": sets,
        "manifest_file": "data/manifests/pseudobulk.tsv",
        "sets_search": (f"{PORTAL}/search/?type=PseudobulkSet&"
                        + "&".join("accession=" + s["accession"] for s in sets)),
    }
    with open(OUT, "w") as fh:
        json.dump(payload, fh, indent=2)

    cols = ["file_accession", "file_set", "state", "description", "donors",
            "days", "content_type", "file_format", "size_bytes", "md5sum",
            "download_url", "s3_uri", "submitted_file_name", "released"]
    os.makedirs(os.path.dirname(OUT_TSV), exist_ok=True)
    with open(OUT_TSV, "w") as fh:
        fh.write("\t".join(cols) + "\n")
        for s in sets:
            for f in s["files"]:
                fh.write("\t".join([
                    f["accession"] or "", s["accession"] or "", s["name"] or "",
                    s["qualifier"] or "", ";".join(s["donors"]),
                    ";".join(str(d) for d in s["days"]),
                    f["content_type"] or "", f["file_format"] or "",
                    str(f["size"] or ""), f["md5"] or "", f["download"],
                    f["s3_uri"] or "", f["filename"] or "",
                    "yes" if s["released"] else "no",
                ]) + "\n")

    sys.stderr.write(
        f"pseudobulk: {len(sets)} sets, {payload['n_files']} files, "
        f"{payload['n_released']} sets public"
        + (f", {len(kept)} carried over from the last build" if kept else "")
        + f"\nwrote {OUT}\n      {OUT_TSV}\n")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
