#!/usr/bin/env python3
"""Crawl the IGVF portal for the five principal analysis sets of the PGP
reprogramming study and emit the site's data files.

Layer model on the portal:
    measurement set  (experimental data: FASTQ + seqspec)
      -> intermediate analysis set  (per-library processed: BAM, matrices, ...)
        -> principal analysis set   (final, per-modality)

Outputs (all under site/data/):
    filesets.json          page content: tiers, donor matrix, per-set file lists
    files.json             flat file index the in-page download builder filters
    manifests/*.tsv        pre-built download manifests, one per set per tier
    manifests/all-files.tsv    every file in the study

Every file record carries a direct download URL
(https://api.data.igvf.org/<type>/<acc>/@@download/<acc>.<ext>, which 307s to
public S3) plus the s3_uri, byte size and md5, so both the page and the
manifests can offer one-click and scripted downloads without a portal login.

Run:  python3 build/fetch_igvf.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

API = "https://api.data.igvf.org"
PORTAL = "https://data.igvf.org"
# The two labs' portal holdings are exactly this study, verified against the
# search API (1,152 raw / 640 processed / 21 final files), so lab-scoped
# queries are safe for the totals row.
LAB_Q = "lab.title=Chongyuan+Luo%2C+UCLA&lab.title=Kathrin+Plath%2C+UCLA"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
DATA = os.path.join(HERE, os.pardir, "data")
OUT = os.path.join(DATA, "filesets.json")
OUT_FILES = os.path.join(DATA, "files.json")
MANIFESTS = os.path.join(DATA, "manifests")

PRINCIPAL = [
    "IGVFDS1270EUID",  # WGS
    "IGVFDS3268OMJN",  # 10x Multiome
    "IGVFDS9439VWMI",  # snMCT-seq
    "IGVFDS8004ZFOL",  # snM3C-seq
    "IGVFDS6501PVZQ",  # Spatial
]

# Display order / short labels, keyed by accession.
# Reprogramming efficiency as reported in the manuscript (Figure S1A: TRA1-60+
# clone counts at day 12). A8 is not a manuscript line -- it appears only in the
# two pilot spatial runs bundled into the spatial principal set.
DONOR_NOTES = {
    "C29": ("efficient", "profiled in all five modalities"),
    "C39": ("efficient", ""),
    "C37": ("inefficient", ""),
    "C38": ("inefficient", "profiled in all five modalities"),
    "A8": ("not in manuscript", "pilot spatial runs only"),
}

MODALITY = {
    "IGVFDS3268OMJN": ("10x Multiome", "snRNA + snATAC", 1),
    "IGVFDS9439VWMI": ("snMCT-seq",    "snRNA + mC",     2),
    "IGVFDS8004ZFOL": ("snM3C-seq",    "mC + 3C",        3),
    "IGVFDS6501PVZQ": ("Spatial (CosMx)", "in situ RNA", 4),
    "IGVFDS1270EUID": ("WGS",          "genotypes",      5),
}

# What each tier is called on the page, and the portal type its metadata
# endpoint expects.
TIERS = {
    "principal": ("Analysis-ready", "AnalysisSet"),
    "intermediate": ("Processed", "AnalysisSet"),
    "measurement": ("Raw", "MeasurementSet"),
}


def fetch(path):
    """GET <API><path>?format=json with an on-disk cache."""
    key = path.strip("/").replace("/", "_") + ".json"
    cp = os.path.join(CACHE, key)
    if os.path.exists(cp):
        with open(cp) as fh:
            return json.load(fh)
    url = f"{API}{path}?format=json" if "?" not in path else f"{API}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                d = {"_error": e.code, "@id": path}
                break
            time.sleep(1.5 * (attempt + 1))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    else:
        d = {"_error": "unreachable", "@id": path}
    os.makedirs(CACHE, exist_ok=True)
    with open(cp, "w") as fh:
        json.dump(d, fh)
    return d


def fetch_many(paths):
    paths = list(dict.fromkeys(paths))
    with ThreadPoolExecutor(max_workers=6) as ex:
        return dict(zip(paths, ex.map(fetch, paths)))


def file_search(accessions, content_type=None):
    """Portal search listing every file belonging to the given file sets."""
    q = "type=File&" + "&".join("file_set.accession=" + a for a in accessions)
    if content_type:
        q += "&content_type=" + urllib.parse.quote_plus(content_type)
    return f"{PORTAL}/search/?{q}"


def manifest_url(portal_type, accessions=None, input_for=None, content_type=None):
    """The portal's metadata TSV endpoint: one row per file, including a
    'File download URL' column. This is the live, always-current manifest —
    the same rows we also ship statically under data/manifests/."""
    q = [f"type={portal_type}"]
    for a in accessions or []:
        q.append("accession=" + a)
    if input_for:
        q.append("input_for=" + urllib.parse.quote(input_for, safe=""))
    if content_type:
        q.append("files.content_type=" + urllib.parse.quote_plus(content_type))
    return f"{API}/metadata/?" + "&".join(q)


def files_of(d, tier, donor_names=None, days=None, mux=False):
    """Per-file records with everything needed to download the file directly."""
    out = []
    for f in d.get("files", []) or []:
        if not isinstance(f, dict) or not f.get("href"):
            continue
        out.append({
            "accession": f.get("accession"),
            "content_type": f.get("content_type"),
            "file_format": f.get("file_format"),
            "href": f.get("@id"),
            "download": API + f["href"],
            "s3_uri": f.get("s3_uri"),
            "size": f.get("file_size"),
            "md5": f.get("md5sum"),
            "summary": f.get("summary"),
            "assembly": f.get("assembly"),
            # Several files in a set can share a content type (the spatial set
            # has one matrix per slide pair); the lab's alias and the submitted
            # filename are what tell them apart.
            "alias": alias_of(f),
            "filename": os.path.basename(f.get("submitted_file_name") or ""),
            "tier": tier,
            "file_set": d.get("accession"),
            "donors": donor_names or [],
            "days": days or [],
            "mux": mux,
        })
    return sorted(out, key=lambda x: (x["content_type"] or "",
                                      x["accession"] or ""))


def type_breakdown(file_recs, accessions, portal_type, input_for=None):
    """content_type -> count, total bytes, portal search + manifest URLs."""
    tally = {}
    for f in file_recs:
        ct = f["content_type"] or "other"
        e = tally.setdefault(ct, {"content_type": ct, "formats": set(),
                                  "n": 0, "bytes": 0})
        e["n"] += 1
        e["bytes"] += f["size"] or 0
        if f["file_format"]:
            e["formats"].add(f["file_format"])
    out = []
    for e in sorted(tally.values(), key=lambda x: -x["n"]):
        out.append({
            "content_type": e["content_type"],
            "file_format": "/".join(sorted(e["formats"])),
            "n": e["n"],
            "bytes": e["bytes"],
            "search": file_search(accessions, e["content_type"]),
            "manifest": manifest_url(portal_type,
                                     accessions=None if input_for else accessions,
                                     input_for=input_for,
                                     content_type=e["content_type"]),
        })
    return out


SLIDE_RE = re.compile(r"slide[_-]?(\d+)", re.I)
CODE_RE = re.compile(r"pgp_([a-z0-9]+)_analysis_set", re.I)


def alias_of(rec):
    for a in rec.get("aliases", []) or []:
        return a.split(":", 1)[-1]
    return None


def day_of_sample(sample):
    """Reprogramming day of one biosample, from the portal's own summary.
    'induced … for 12 days' -> 12; an uninduced primary fibroblast -> day 0."""
    summary = sample.get("summary") or ""
    m = re.search(r"for (\d+) days?", summary)
    if m:
        return int(m.group(1))
    if "/primary-cells/" in (sample.get("@id") or "") or "induced" not in summary:
        return 0
    return None


def donor_days(upstream_ms, sample_recs, name_of):
    """(donor, day) pairs covered by one intermediate set.

    The Multiome libraries are genetically multiplexed: one library pools four
    donors sampled on four *different* days, so a library has a set of
    donor-days rather than a single timepoint. snMCT-seq, snM3C-seq and WGS
    libraries are one donor at one day; the spatial slides are pooled sections
    at a single day.
    """
    pairs, multiplexed = [], False
    for m in upstream_ms:
        for s in m.get("samples", []) or []:
            if not isinstance(s, dict):
                continue
            rec = sample_recs.get(s.get("@id"))
            comps = (rec or {}).get("multiplexed_samples") or []
            if comps:
                multiplexed = True
                for c in comps:
                    day = day_of_sample(c)
                    for dn in c.get("donors", []) or []:
                        pairs.append((name_of.get(dn.get("accession"),
                                                  dn.get("accession")), day))
            else:
                day = day_of_sample(s)
                for dn in m.get("donors", []) or []:
                    pairs.append((name_of.get(dn.get("accession"),
                                              dn.get("accession")), day))
    return sorted(set(pairs), key=lambda p: (p[0], -1 if p[1] is None else p[1])), multiplexed


def describe_group(inter, upstream_ms, sample_recs, name_of):
    """One row of the processed tier: what a single library actually contains."""
    alias = alias_of(inter) or inter.get("accession")
    pairs, multiplexed = donor_days(upstream_ms, sample_recs, name_of)
    donors = sorted({p[0] for p in pairs})
    days = sorted({p[1] for p in pairs if p[1] is not None})

    code = None
    m = CODE_RE.search(alias or "")
    if m:
        code = m.group(1)
    slide = None
    m = SLIDE_RE.search(alias or "")
    if m:
        slide, code = int(m.group(1)), None

    # Label the thing a user would pick from: a slide, a donor-day library, or
    # a multiplexed library named by its lab code.
    if slide is not None:
        bits = [f"slide {slide}"]
        bits.append(", ".join(donors) if len(donors) <= 2 else f"{len(donors)} donors")
        if len(days) == 1:
            bits.append(f"day {days[0]}")
    elif len(donors) == 1 and len(days) <= 1:
        bits = [donors[0]] + ([f"day {days[0]}"] if days else [])
    else:
        bits = [code or alias, f"{len(donors)} donors"]
        if days:
            bits.append("days " + ", ".join(str(x) for x in days))
    return {
        "accession": inter.get("accession"),
        "alias": alias,
        "code": code,
        "label": " · ".join(b for b in bits if b) or alias,
        "donors": donors,
        "days": days,
        "donor_days": [{"donor": d, "day": y} for d, y in pairs],
        "multiplexed": multiplexed,
        "slide": slide,
    }


def write_tsv(path, rows):
    cols = ["file_accession", "tier", "file_set", "donors", "days",
            "content_type", "file_format", "size_bytes", "md5sum",
            "download_url", "s3_uri"]
    with open(path, "w") as fh:
        fh.write("\t".join(cols) + "\n")
        for r in rows:
            fh.write("\t".join([
                r["accession"] or "",
                r["tier"],
                r["file_set"] or "",
                ";".join(r["donors"] or []),
                ";".join(str(x) for x in r["days"] or []),
                r["content_type"] or "",
                r["file_format"] or "",
                str(r["size"] or ""),
                r["md5"] or "",
                r["download"],
                r["s3_uri"] or "",
            ]) + "\n")


def main():
    principal = fetch_many([f"/analysis-sets/{a}/" for a in PRINCIPAL])

    inter_paths, ms_paths = [], []
    for d in principal.values():
        inter_paths += [x["@id"] for x in d.get("input_file_sets", [])
                        if isinstance(x, dict)]
    sys.stderr.write(f"intermediates: {len(set(inter_paths))}\n")
    inter = fetch_many(inter_paths)

    for d in inter.values():
        ms_paths += [x["@id"] for x in d.get("input_file_sets", [])
                     if isinstance(x, dict)]
    sys.stderr.write(f"measurement sets: {len(set(ms_paths))}\n")
    ms = fetch_many(ms_paths)

    # Multiplexed samples hold the reprogramming day for the pooled Multiome
    # libraries, which the set aliases do not carry.
    sample_paths = [s["@id"] for m in ms.values()
                    for s in m.get("samples", []) or []
                    if isinstance(s, dict) and "multiplexed" in s.get("@id", "")]
    sample_recs = fetch_many(sample_paths) if sample_paths else {}

    # Resolve donor accessions to the manuscript's line names via portal aliases.
    donor_paths = []
    for d in principal.values():
        donor_paths += [x["@id"] for x in d.get("donors", []) if isinstance(x, dict)]
    donor_recs = fetch_many(donor_paths)
    donors_meta = {}
    for p, rec in donor_recs.items():
        acc = p.strip("/").split("/")[-1]
        alias = alias_of(rec)
        eff, note = DONOR_NOTES.get(alias, ("", ""))
        donors_meta[acc] = {
            "accession": acc,
            "name": alias or acc,
            "sex": rec.get("sex"),
            "efficiency": eff,
            "note": note,
            "portal": f"https://data.igvf.org/human-donors/{acc}/",
        }
    name_of = {a: m["name"] for a, m in donors_meta.items()}

    donors_all, out_sets, all_files = set(), [], []
    for acc in PRINCIPAL:
        d = principal[f"/analysis-sets/{acc}/"]
        label, sub, order = MODALITY[acc]
        my_inter = [x["@id"] for x in d.get("input_file_sets", [])
                    if isinstance(x, dict)]
        inter_accs = [p.strip("/").split("/")[-1] for p in my_inter]

        donors = sorted(x["accession"] for x in d.get("donors", []))
        donors_all |= set(donors)

        # Walk each intermediate set: its upstream raw sets, its donors/day, and
        # the files of both tiers tagged with that context.
        groups, proc_files, raw_files, my_ms = [], [], [], []
        for p in my_inter:
            i = inter[p]
            if i.get("_error"):
                continue
            up = [x["@id"] for x in i.get("input_file_sets", [])
                  if isinstance(x, dict)]
            my_ms += up
            up_recs = [ms[q] for q in up if not ms[q].get("_error")]
            g = describe_group(i, up_recs, sample_recs, name_of)
            dnames = g["donors"] or sorted(
                {name_of.get(x["accession"], x["accession"])
                 for x in i.get("donors", []) if isinstance(x, dict)})
            proc = files_of(i, "processed", dnames, g["days"], g["multiplexed"])
            raw = []
            for m in up_recs:
                raw += files_of(m, "raw", dnames, g["days"], g["multiplexed"])
            g["n_files"] = len(proc)
            g["bytes"] = sum(f["size"] or 0 for f in proc)
            g["raw_files"] = len(raw)
            g["raw_bytes"] = sum(f["size"] or 0 for f in raw)
            g["portal"] = f"{PORTAL}/analysis-sets/{g['accession']}/"
            groups.append(g)
            proc_files += proc
            raw_files += raw
        my_ms = list(dict.fromkeys(my_ms))
        ms_accs = [p.strip("/").split("/")[-1] for p in my_ms]
        groups.sort(key=lambda g: (g["slide"] or 0,
                                   g["days"][0] if g["days"] else 99,
                                   g["label"]))

        final_files = files_of(d, "analysis-ready",
                               sorted({name_of.get(a, a) for a in donors}),
                               sorted({y for g in groups for y in g["days"]}),
                               any(g["multiplexed"] for g in groups))
        all_files += final_files + proc_files + raw_files

        out_sets.append({
            "accession": acc,
            "label": label,
            "sublabel": sub,
            "order": order,
            "summary": d.get("summary"),
            "description": d.get("description"),
            "assay_titles": d.get("assay_titles", []),
            "preferred_assay_titles": d.get("preferred_assay_titles", []),
            "lab": (d.get("lab") or {}).get("title"),
            "doi": d.get("doi"),
            "portal": f"https://data.igvf.org/analysis-sets/{acc}/",
            "status": d.get("status"),
            "controlled_access": d.get("controlled_access"),
            "sample_summary": d.get("simplified_sample_summary"),
            "donors": donors,
            "n_samples": len(d.get("samples", []) or []),
            "workflows": [w.get("name") for w in d.get("workflows", [])
                          if isinstance(w, dict)],
            "files": final_files,
            "bytes": sum(f["size"] or 0 for f in final_files),
            "files_search": file_search([acc]),
            "manifest": manifest_url("AnalysisSet", accessions=[acc]),
            "types": type_breakdown(final_files, [acc], "AnalysisSet"),
            "manifest_file": f"data/manifests/{acc}-analysis-ready.tsv",
            "intermediate": {
                "n_sets": len(inter_accs),
                "n_files": len(proc_files),
                "bytes": sum(f["size"] or 0 for f in proc_files),
                "accessions": inter_accs,
                "files_search": file_search(inter_accs),
                "sets_search": (f"{PORTAL}/search/?type=AnalysisSet&input_for="
                                + urllib.parse.quote(f"/analysis-sets/{acc}/", safe="")),
                "manifest": manifest_url("AnalysisSet",
                                         input_for=f"/analysis-sets/{acc}/"),
                "manifest_file": f"data/manifests/{acc}-processed.tsv",
                "types": type_breakdown(proc_files, inter_accs, "AnalysisSet",
                                        input_for=f"/analysis-sets/{acc}/"),
                "groups": groups,
            },
            "measurement": {
                "n_sets": len(ms_accs),
                "n_files": len(raw_files),
                "bytes": sum(f["size"] or 0 for f in raw_files),
                "accessions": ms_accs,
                "files_search": file_search(ms_accs),
                "sets_search": (f"{PORTAL}/search/?type=MeasurementSet&"
                                + "&".join("accession=" + a for a in ms_accs)),
                "manifest": manifest_url("MeasurementSet", accessions=ms_accs),
                "manifest_file": f"data/manifests/{acc}-raw.tsv",
                "types": type_breakdown(raw_files, ms_accs, "MeasurementSet"),
            },
        })

    out_sets.sort(key=lambda x: x["order"])

    # Downstream pseudobulk sets, shared across modalities. Gated at time of
    # writing -- recorded but rendered unlinked until they are released.
    downstream = {}
    for acc in PRINCIPAL:
        for p in principal[f"/analysis-sets/{acc}/"].get("input_for", []) or []:
            pid = p if isinstance(p, str) else p.get("@id")
            downstream.setdefault(pid, []).append(acc)

    payload = {
        "generated": time.strftime("%Y-%m-%d"),
        "donors": sorted(donors_all),
        "donor_meta": donors_meta,
        "sets": out_sets,
        "downstream": [
            {"id": k, "accession": k.strip("/").split("/")[-1], "from": v}
            for k, v in sorted(downstream.items())
        ],
        "totals": {
            "principal": len(out_sets),
            "intermediate": len(set(inter_paths)),
            "measurement": len(set(ms_paths)),
            "files": len(all_files),
            "bytes": sum(f["size"] or 0 for f in all_files),
            "search": {
                "measurement": f"{PORTAL}/search/?type=File&{LAB_Q}"
                               "&file_set.file_set_type=experimental+data",
                "intermediate": f"{PORTAL}/search/?type=File&{LAB_Q}"
                                "&file_set.file_set_type=intermediate+analysis",
                "principal": f"{PORTAL}/search/?type=File&{LAB_Q}"
                             "&file_set.file_set_type=principal+analysis",
                "all": f"{PORTAL}/search/?type=File&{LAB_Q}",
            },
            "manifest_file": "data/manifests/all-files.tsv",
        },
    }
    os.makedirs(DATA, exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(payload, fh, indent=2)

    # Flat file index for the in-page download builder. Column-oriented rows
    # keep it small enough to fetch on load (~1,800 files).
    cols = ["accession", "tier", "file_set", "content_type", "file_format",
            "size", "md5", "download", "s3_uri", "days", "donors", "mux"]
    by_set = {}
    for s in out_sets:
        recs = [f for f in all_files
                if f["file_set"] == s["accession"]
                or f["file_set"] in s["intermediate"]["accessions"]
                or f["file_set"] in s["measurement"]["accessions"]]
        by_set[s["accession"]] = [[f["accession"], f["tier"], f["file_set"],
                                   f["content_type"], f["file_format"],
                                   f["size"], f["md5"], f["download"],
                                   f["s3_uri"], f["days"],
                                   f["donors"], 1 if f["mux"] else 0]
                                  for f in recs]
    with open(OUT_FILES, "w") as fh:
        json.dump({"generated": payload["generated"], "columns": cols,
                   "sets": by_set}, fh, separators=(",", ":"))

    # Static manifests: one per set per tier, plus the whole study.
    os.makedirs(MANIFESTS, exist_ok=True)
    for s in out_sets:
        acc = s["accession"]
        write_tsv(os.path.join(MANIFESTS, f"{acc}-analysis-ready.tsv"),
                  [f for f in all_files if f["tier"] == "analysis-ready"
                   and f["file_set"] == acc])
        write_tsv(os.path.join(MANIFESTS, f"{acc}-processed.tsv"),
                  [f for f in all_files if f["tier"] == "processed"
                   and f["file_set"] in s["intermediate"]["accessions"]])
        write_tsv(os.path.join(MANIFESTS, f"{acc}-raw.tsv"),
                  [f for f in all_files if f["tier"] == "raw"
                   and f["file_set"] in s["measurement"]["accessions"]])
    write_tsv(os.path.join(MANIFESTS, "all-files.tsv"), all_files)

    sys.stderr.write(f"wrote {OUT}\n       {OUT_FILES}\n"
                     f"       {MANIFESTS}/*.tsv\n")
    sys.stderr.write(json.dumps(payload["totals"], indent=2) + "\n")


if __name__ == "__main__":
    main()
