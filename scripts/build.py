"""build.py — the open-research data build: the research archive's atlas export → data/atlas.sqlite (+ data/meta.json).

  uv run --with zstandard==0.23.0 --with brotli==1.1.0 scripts/build.py [--surface <atlas export folder>]
  uv run --with zstandard==0.23.0 --with brotli==1.1.0 scripts/build.py --volume-only   # only add `volume` to data/meta.json

open-research collects nothing (rule O1): it reads the atlas export that the research archive
writes every night (surface.json, nodes, edges, redirects, docs, changes as .jsonl.zst) and refuses a surface major
version it was not written for. The output is one read-only SQLite file the app opens with node:sqlite:

  meta(k, v)                 JSON: the surface, counts, families, decades, the grove summary, the latest arrivals
  nodes(id, kind, slug, en, ko, parent, n, page)   one row per live node; page = brotli JSON summary for its page
  docs(idx, slug, date, received, family, kind, row, card)   row = brotli JSON list line, card = brotli JSON record
  dn(node, date, idx, r)     membership, newest first by (node, date); r = 0 primary/stated, 1 secondary/inferred
  redirects(kind, slug, to_kind, to_slug)          merged and retired nodes (rule O5)
  docs_fts, nodes_fts        FTS5 over titles, names and concepts; node labels

Rules kept here: no text of the documents beyond titles (O2; quotes and abstracts never reach the surface), every
model-written item keeps its mark (O3), stated and inferred JEL apart (O10), counts of one release (O4).
"""
import argparse
import csv
import datetime as dt
import html
import io
import json
import os
import re
import sqlite3
import stat
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import brotli
import zstandard

import geo

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config"
OUT = ROOT / "data"
SOURCES = Path(os.environ.get("ARCHIVE_SOURCES", str(ROOT / "sources")))
UNIT_LABELS = ROOT / "app" / "lib" / "i18n.ts"
SURFACE_MAJOR = "1"
YEAR0 = 1973
TOP = 12


def rd(path):
    with open(path, "rb") as f:
        for line in io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(f), encoding="utf-8"):
            if line.strip():
                yield json.loads(line)


def br(obj):
    return brotli.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode(), quality=9)


FAMS = ("cb", "bis", "io", "acad")


class Agg:
    """Counts for one node's page: documents a year by family, kinds, and the top related nodes."""
    __slots__ = ("n", "years", "kinds", "rel", "recent")

    def __init__(self):
        self.n = 0
        self.years = defaultdict(lambda: [0, 0, 0, 0])
        self.kinds = Counter()
        self.rel = defaultdict(Counter)

    def add(self, d, fam_i, rels):
        self.n += 1
        y = (d.get("date") or "")[:4]
        if y.isdigit():
            self.years[int(y)][fam_i] += 1
        self.kinds[d.get("kind") or "paper"] += 1
        for kind, ids in rels.items():
            for i in ids:
                self.rel[kind][i] += 1


def un(x):
    """Decode the HTML entities some publishers leave in names and titles ("Tabakovi&#263;" → "Tabaković")."""
    return html.unescape(x).replace(" ", " ") if isinstance(x, str) and "&" in x else x


_LONE_INITIAL = re.compile(r"(?<![\w.’'-])([A-Z])(?=\s|,|$)")
_STRAY_ACCENT = re.compile(r"[´`¨˘ˇ˜ˊˋ]+")


def person_name(x):
    """One display form for a person's name: initials take a full stop ("Philip R Lane" → "Philip R. Lane", "K C
    Chakrabarty" → "K. C. Chakrabarty"), "Jr"/"Sr" too, and stray spacing accents go ("Tabaković´" → "Tabaković").
    Display only: the people registry's merge rules (and so the slugs) are untouched."""
    if not isinstance(x, str):
        return x
    x = _STRAY_ACCENT.sub("", x)
    x = re.sub(r"\s+", " ", x).strip(" ,")
    if x.isupper() or len(x) < 4:
        return x
    x = _LONE_INITIAL.sub(r"\1.", x)
    return re.sub(r",?\s+(Jr|Sr)\.?$", r", \1.", x)


def clean_names(nodes, docs, econ):
    for n in nodes.values():
        n["en"], n["ko"] = un(n["en"]), un(n["ko"])
        if n["kind"] == "person":
            n["en"] = person_name(n["en"])
        if n["kind"] == "place" and not (n.get("data") or {}).get("region"):
            e = econ.get(n["key"])          # Monaco had no region in the 2026.11 release (fixed upstream for the next one)
            if e and e.get("region"):
                n.setdefault("data", {})["region"] = e["region"]
                n["ko"] = n["ko"] or e.get("name_ko") or None
    for d in docs:
        d["title"] = un(d.get("title"))
        for a in d["authors"]:
            a["name"] = person_name(un(a["name"]))
            if a.get("aff_name"):
                a["aff_name"] = un(a["aff_name"])
        if d.get("speaker"):
            d["speaker"]["name"] = person_name(un(d["speaker"]["name"]))
        d["org_names"] = [[un(x[0]), *x[1:]] for x in d.get("org_names") or []]
        d["place_names"] = [[un(x[0]), *x[1:]] for x in d.get("place_names") or []]
        d["people"] = [{**p, "name": un(p.get("name"))} for p in d.get("people") or []]
        # The central bankers' speeches feed files every speech without a named speaker under "Bank of Italy"
        # (5,634 of them, 1997–2026); that institution is a scraper default, not the publisher.
        if d["unit"] == "bis_cbspeeches" and not d.get("speaker") and d.get("institution") == "Bank of Italy":
            d["publisher"] = None
            d["institution"] = None
            d["orgs"] = [x for x in d["orgs"] if x[1] != "publisher"]


SPEECH_UNITS = {"bis_cbspeeches", "bis_mgmtspeeches", "fsb_speeches"}
IN_HOUSE = {"imf_wpapers", "worldbank_prwp", "bis_wpapers", "bis_papers", "bis_bulletins", "bis_quarterly", "bis_fsi",
            "oecd_eco_wpapers", "cb_reshub"}


def affiliations(docs, nodes):
    """Each person's affiliation per document, from the strongest evidence a document has:

      stated  the publisher says so: a speech's institution is its speaker's; SUERF lists one affiliation per author
      found   a single-author document whose card names exactly one affiliation, found in the text
      series  a staff series (IMF, World Bank, BIS, OECD, a central bank's working papers): used only for someone with
              no stated or found affiliation, and only for a series they wrote in at least twice

      coauthored  an affiliation listed on several of a person's multi-author documents that no single co-author
              explains: it still appears on two or more of them after taking away any one co-author's documents (so
              a co-author's employer is not passed on). Used only for years before the person's stronger evidence
              starts, to fill the early timeline ("Princeton University 2008–2013"); never the latest affiliation,
              never someone's only evidence. The series publishers (NBER, SUERF) never count.

    The organisations a document merely names are never used. The latest affiliation is the one with the most recent
    document (by full date, not year: a governor's first speeches beat the working papers still coming out of the old
    job), among affiliations seen at least twice. Returns {person: {latest, timeline, tier}}.
    """
    ev = defaultdict(list)
    series = defaultdict(list)
    multi = defaultdict(list)                  # person → [(date, {orgs}, {co-authors})] for multi-author documents
    networks = {i for i, n in nodes.items() if n["kind"] == "org" and n["slug"] in NETWORK_SLUGS}
    for d in docs:
        date = d.get("date") or ""
        if not date[:4].isdigit():
            continue
        pub = d.get("publisher")
        listed = [a for a in d["authors"] if a.get("p")]
        if d["unit"] in SPEECH_UNITS:
            sp = (d.get("speaker") or {}).get("p")
            if sp and pub:
                ev[sp].append((date, pub, None, "stated"))
            continue
        for a in listed:
            if a.get("aff") or a.get("aff_name"):
                ev[a["p"]].append((date, a.get("aff"), None if a.get("aff") else a["aff_name"], "stated"))
        if len(listed) == 1 and not listed[0].get("aff_name"):
            affs = [o for o, r in d["orgs"] if r == "affiliation"]
            if len(affs) == 1:
                ev[listed[0]["p"]].append((date, affs[0], None, "found"))
        if d["unit"] in IN_HOUSE and pub and ((nodes.get(pub) or {}).get("data") or {}).get("type") in ("central_bank", "international"):
            for a in listed:
                series[a["p"]].append((date, pub, None, "series"))
        if len(d["authors"]) >= 2 and listed and not any(a.get("aff_name") for a in d["authors"]):
            affs = {o for o, r in d["orgs"] if r == "affiliation" and o not in networks}
            if affs:
                # co-authors by name: many have no person page (one document only) but still bring their employer
                for a in listed:
                    multi[a["p"]].append((date, affs, {re.sub(r"\W", "", b["name"].lower()) for b in d["authors"] if b is not a}))

    def coauthored(p):
        """Organisations on p's multi-author documents that survive removing any one co-author's documents."""
        by_org = defaultdict(list)
        for date, affs, co in multi.get(p, []):
            for o in affs:
                by_org[o].append((date, co))
        out = []
        for o, xs in by_org.items():
            if len(xs) < 3:
                continue
            cos = set().union(*(co for _, co in xs))
            if all(sum(1 for _, co in xs if c not in co) >= 2 for c in cos):
                out.extend((date, o, None, "coauthored") for date, co in xs)
        return out

    def runs_of(xs):
        runs = {}
        for date, org, name, tier in sorted(xs, key=lambda x: x[0]):
            k = org or name
            y = int(date[:4])
            r = runs.setdefault(k, {"org": org, "name": name, "y0": y, "y1": y, "d1": date, "n": 0, "tier": tier})
            r["y1"] = max(r["y1"], y)
            r["d1"] = max(r["d1"], date)
            r["n"] += 1
            if tier == "stated":
                r["tier"] = "stated"
        return runs

    out = {}
    for p in set(ev) | set(series) | set(multi):
        cnt = Counter(o for _, o, _, _ in series.get(p, []))
        ser = [x for x in series.get(p, []) if cnt[x[1]] >= 2]
        runs = runs_of(ev.get(p) or [])
        # One-off entries (a stray card) do not make a latest affiliation or a step in the timeline when the person
        # has an affiliation seen at least twice. Without one: a single stated affiliation stands, but a single card
        # merely naming an organisation never beats a staff series seen twice (thirty BIS working papers, say).
        rs = [r for r in runs.values() if r["n"] >= 2]
        if not rs:
            stated1 = [r for r in runs.values() if r["tier"] == "stated"]
            if stated1:                          # a publisher's word, even once, beats a staff series
                rs = stated1
            elif ser:                            # a lone found-in-text mention does not
                runs = runs_of(ser)
                rs = list(runs.values())
            else:
                rs = list(runs.values())
        if not rs:
            continue
        start = min(r["y0"] for r in rs)
        early = []
        # only the years before the stronger evidence starts; at most two, one after the other, the larger first
        for r in sorted(runs_of(coauthored(p)).values(), key=lambda r: -r["n"]):
            if (r["org"] or r["name"]) in runs or r["y0"] >= start:
                continue
            r["y1"] = min(r["y1"], start - 1)
            if len(early) < 2 and all(r["y1"] < e["y0"] or r["y0"] > e["y1"] for e in early):
                early.append(r)
        best = max(rs, key=lambda r: (r["d1"], r["n"]))
        latest = {k: v for k, v in best.items() if k != "d1"} | {"year": best["y1"]}
        timeline = [{k: v for k, v in r.items() if k != "d1"} for r in sorted(rs + early, key=lambda r: (r["y0"], r["y1"]))]
        out[p] = {"latest": latest, "timeline": timeline[-6:], "tier": latest["tier"]}
    return out


NETWORK_SLUGS = {"nber", "9197-national-bureau-of-economic-research-inc", "suerf", "cepr"}


STRIP_TAIL = re.compile(r"\s+(models?|approach(es)?|methods?|methodology|framework|techniques?|design|analysis|functions?|estimation|estimates?)$")


def _sing(w):
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is")) else w


def _dkey(x, acr=None):
    x = re.sub(r"[\-‐–—/,]", " ", x.lower())
    x = re.sub(r"[’'`.]", "", x)
    x = re.sub(r"\s+", " ", x).strip()
    w = [_sing(t) for t in x.split(" ")]
    if acr:                                   # "structural VAR" ~ "structural vector autoregression (SVAR)"
        w = " ".join(acr.get(t, t) for t in w).split(" ")
    x = " ".join(w)
    for _ in range(2):
        x = STRIP_TAIL.sub("", x).strip()
    return x


def near_duplicates(nodes, agg):
    """Near-duplicate method and data concepts ("vector autoregression" / "vector autoregression (VAR)", "two-stage least
    squares (2SLS)" / "2SLS", "Current Population Survey (CPS)" / "Current Population Survey"). Shown grouped and
    flagged for merging in the next release; their counts are never added together here."""
    groups = []
    for sub in ("method", "data"):
        ids = [i for i, n in nodes.items() if n["kind"] == "concept" and (n.get("data") or {}).get("kind") == sub]
        acr = {}                            # acronyms spelled out somewhere in this list: "var" → "vector autoregression"
        for i in ids:
            lab = nodes[i]["en"]
            for a in re.findall(r"\(([^)]+)\)", lab):
                a = a.strip().lower()
                full = _dkey(re.sub(r"\s*\([^)]*\)", "", lab).strip())
                if " " not in a and 2 <= len(a) <= 6 and a.rstrip("s") and "".join(t[0] for t in full.split(" ") if t) .startswith(a.rstrip("s")[0]):
                    acr.setdefault(_sing(a), full)
        keys = {}
        for i in ids:
            lab = nodes[i]["en"]
            base = re.sub(r"\s*\([^)]*\)", "", lab).strip()
            ks = {_dkey(base), _dkey(base, acr)}
            for a in re.findall(r"\(([^)]+)\)", lab):
                if " " not in a.strip() and len(a.strip()) <= 8:
                    ks.add(_dkey(a))
            keys[i] = ks
        exact = defaultdict(list)
        for i, ks in keys.items():
            for k in ks:
                exact[k].append(i)
        for i in ids:                       # "DSGE model" ~ "dynamic stochastic general equilibrium model"
            w = _dkey(re.sub(r"\s*\([^)]*\)", "", nodes[i]["en"])).split(" ")
            ini = "".join(x[0] for x in w if x and x not in ("of", "and", "the", "in"))
            if len(w) >= 3 and len(ini) >= 3 and ini in exact:
                keys[i].add(ini)
                exact[ini].append(i)
        parent = {i: i for i in ids}

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for k, members in exact.items():
            for j in members[1:]:
                a, b = find(members[0]), find(j)
                if a != b:
                    parent[b] = a
        comp = defaultdict(list)
        for i in ids:
            comp[find(i)].append(i)
        for members in comp.values():
            if len(members) > 1:
                members.sort(key=lambda i: -(agg[i].n if i in agg else 0))
                groups.append({"sub": sub, "head": members[0], "members": members})
    return groups


ORG_TYPES = ("central_bank", "international", "research", "university", "government", "private", "other")

# ---------------------------------------------------------------- review 2: grove, people, economies, New
SUPRA = re.compile(r"^(European |Eurosystem)|Eastern Caribbean Central Bank|Arab Monetary Fund|West African States|Central African States")
SPEECH_KINDS = {"speech"}
LANG_WORDS = {
    "en": set("the of and in for on to with from by an is are".split()),
    "fr": set("le la les des du de et pour dans sur une aux est au en l d qu".split()),
    "es": set("el la los las del de y para en una con por sobre que su".split()),
    "pt": set("o a os as do da dos das de e para em uma com por sobre que nos na no ao às pela pelo quem já não".split()),
}
LANG_CHARS = {"fr": re.compile(r"[èêœ]|\bl’|\bd’|qu’|\bl'|\bd'"), "es": re.compile(r"ñ|ción\b|ciones\b|¿"), "pt": re.compile(r"ção\b|ções\b|ões\b|[ãõ]")}


def title_lang(t):
    """EN/FR/ES/PT from a title's function words, for collapsing a paper's language versions in New. English unless
    another language clearly wins."""
    low = (t or "").lower()
    words = re.findall(r"[a-zà-ÿ]+", low)
    score = {k: sum(1 for w in words if w in ws) for k, ws in LANG_WORDS.items()}
    for k, rx in LANG_CHARS.items():
        score[k] += 2 * len(rx.findall(low))
    best = max(("fr", "es", "pt"), key=lambda k: score[k])
    return best if score[best] >= score["en"] + 2 else "en"


def group_key(d):
    """A paper and its translations share a key: the series number (World Bank's "e" re-issues fold in too)."""
    no = (d.get("number") or "").strip()
    if not no or d["unit"] in ("cb_reshub", "bis_cbspeeches", "bis_mgmtspeeches", "fsb_speeches"):
        return d["slug"]
    if d["unit"] == "worldbank_prwp":
        no = re.sub(r"[a-z]$", "", no)
    return f"{d['unit']}|{no.upper()}"


def days_between(a, b):
    try:
        return (dt.date.fromisoformat(b[:10]) - dt.date.fromisoformat(a[:10])).days
    except (TypeError, ValueError):
        return None


def review2_stats(docs, nodes, agg, topic_grove, econ, ref):
    """Everything review 2 added, from one pass over the documents. `ref` is the latest received date: every window
    ("last 24 months", "last 5 years") is counted back from it, by date published.

      groves  growth (2023–2025 over 2020–2022), documents published in the last 12 and 24 months
      people  documents in the last 24 months, speeches, documents a year
      econ    per economy and window (all years, 5 years, 24 months): documents that study it, documents written by
              organisations headquartered there, and who wrote the documents that study it (domestic, foreign,
              international); the country panel's top writers, topics against the world, recent authors, years
    """
    r = dt.date.fromisoformat(ref[:10])
    cut = {"m12": (r - dt.timedelta(days=365)).isoformat(), "m24": (r - dt.timedelta(days=730)).isoformat(),
           "y5": r.replace(year=r.year - 5).isoformat()}
    places = geo.org_places(CONFIG / "org_places.csv")
    networks = {i for i, n in nodes.items() if n["kind"] == "org" and n["slug"] in NETWORK_SLUGS}
    org_iso = {}
    for i, n in nodes.items():
        if n["kind"] != "org":
            continue
        d = n.get("data") or {}
        if d.get("type") == "international" or SUPRA.search(n["en"] or ""):
            org_iso[i] = "INT"
            continue
        iso = (places.get(n["slug"]) or {}).get("iso3") or d.get("country")
        if iso and iso in econ:
            org_iso[i] = iso
    place_iso = {i: n["key"] for i, n in nodes.items() if n["kind"] == "place" and len(n["key"] or "") == 3}
    W = ("all", "y5", "m24")

    g12, g24 = Counter(), Counter()
    p24, psp, pyears = Counter(), Counter(), defaultdict(Counter)
    E = defaultdict(lambda: {"s": [0, 0, 0], "w": [0, 0, 0], "cls": [[0, 0, 0, 0] for _ in W],
                             "orgs": [Counter() for _ in W], "topics": [Counter() for _ in W], "auth": Counter(), "years": defaultdict(lambda: [0, 0])})
    world_t = [Counter() for _ in W]
    world_n = [0, 0, 0]
    for d in docs:
        date = (d.get("date") or "")[:10]
        ok = date[:4].isdigit() and date <= ref
        inw = [True, ok and date >= cut["y5"], ok and date >= cut["m24"]]
        topics = [t for t, _ in d["topics"]]
        for g in dict.fromkeys(topic_grove[t] for t in topics if t in topic_grove):
            if ok and date >= cut["m12"]:
                g12[g] += 1
            if ok and date >= cut["m24"]:
                g24[g] += 1
        persons = list(dict.fromkeys([a["p"] for a in d["authors"] if a.get("p")] + ([d["speaker"]["p"]] if d.get("speaker") and d["speaker"].get("p") else [])))
        for p in persons:
            if inw[2]:
                p24[p] += 1
            if d.get("kind") in SPEECH_KINDS:
                psp[p] += 1
            if date[:4].isdigit():
                pyears[p][int(date[:4])] += 1
        for k in range(3):
            if inw[k]:
                world_n[k] += 1
                world_t[k].update(set(topics))
        ws = ({d["publisher"]} if d.get("publisher") else set()) | {o for o, rl in d["orgs"] if rl in ("affiliation", "author", "speaker", "publisher")} | {a["aff"] for a in d["authors"] if a.get("aff")}
        ws -= networks
        wloc = {org_iso[o] for o in ws if o in org_iso}
        y = int(date[:4]) if date[:4].isdigit() and "2006" <= date[:4] <= ref[:4] else None
        for X in wloc - {"INT"}:
            e = E[X]
            for k in range(3):
                if inw[k]:
                    e["w"][k] += 1
            if y:
                e["years"][y][1] += 1
        for pl in dict.fromkeys(d["places"]):
            X = place_iso.get(pl)
            if not X:
                continue
            e = E[X]
            c = 0 if X in wloc else (2 if wloc == {"INT"} else 1) if wloc else 3   # domestic, foreign, international only, unknown
            for k in range(3):
                if not inw[k]:
                    continue
                e["s"][k] += 1
                e["cls"][k][c] += 1
                e["orgs"][k].update(ws)
                e["topics"][k].update(set(topics))
            if inw[2]:
                e["auth"].update(persons)
            if y:
                e["years"][y][0] += 1

    groves = {}
    for g, n in nodes.items():
        if n["kind"] != "grove":
            continue
        a = agg.get(g) or Agg()
        yr = {y: sum(v) for y, v in a.years.items()}
        new3, old3 = sum(yr.get(y, 0) for y in (2023, 2024, 2025)), sum(yr.get(y, 0) for y in (2020, 2021, 2022))
        groves[g] = {"growth": round(new3 / old3 - 1, 3) if old3 else None, "n12": g12[g], "n24": g24[g],
                     "share24": round(g24[g] / a.n, 4) if a.n else 0}

    econ_out = {}
    for X, e in E.items():
        win = []
        for k in range(3):
            dom, fo, intl, unk = e["cls"][k]
            known = dom + fo + intl
            orgs = [[o, c, "dom" if org_iso.get(o) == X else "intl" if org_iso.get(o) == "INT" else "for" if o in org_iso else "unk"] for o, c in e["orgs"][k].most_common(10)]
            tps = [[t, c, round((c / e["s"][k]) / (world_t[k][t] / world_n[k]), 2) if e["s"][k] and world_t[k][t] else None] for t, c in e["topics"][k].most_common(5)]
            win.append({"s": e["s"][k], "w": e["w"][k], "dom": dom, "for": fo, "intl": intl, "unk": unk,
                        "out": round((fo + intl) / known, 3) if known >= 5 else None, "orgs": orgs, "topics": tps})
        econ_out[X] = {"win": win, "auth": [[p, c] for p, c in e["auth"].most_common(5)],
                       "years": {str(y): v for y, v in sorted(e["years"].items())}}
    return groves, {"n24": p24, "sp": psp, "years": pyears}, econ_out


def tiles_blob(econ_out, econ, nodes):
    """The tile map: config/tile_grid.csv positions, the colouring numbers per window, region membership for zoom."""
    grid = []
    path = CONFIG / "tile_grid.csv"
    if path.exists():
        with open(path, newline="") as f:
            grid = [(r["iso3"], int(r["col"]), int(r["row"])) for r in csv.DictReader(f)]
    place = {n["key"]: n for n in nodes.values() if n["kind"] == "place"}
    out = []
    for iso, col, row in grid:
        e = econ.get(iso) or {}
        x = econ_out.get(iso)
        n = place.get(iso)
        sub, reg = e.get("subregion") or "", e.get("region") or ""
        zones = [z for z, ok in (
            ("europe", reg == "Europe"), ("americas", reg == "Americas"),
            ("asiapac", reg in ("Asia", "Oceania") and sub != "Western Asia"),
            ("africa", reg == "Africa"), ("mideast", sub in ("Western Asia", "Northern Africa") or iso in ("IRN", "AFG", "PAK"))) if ok]
        out.append({"iso": iso, "c": col, "r": row, "slug": n["slug"] if n else None, "en": (n or {}).get("en") or e.get("name_en"),
                    "ko": (n or {}).get("ko") or e.get("name_ko") or None, "z": zones,
                    "m": [[w["s"], w["w"], w["out"]] for w in x["win"]] if x else [[0, 0, None]] * 3})
    return out


def map_blob(nodes, agg, econ):
    """Everything the map page draws: land, organisation clusters at their headquarters, economies at their centroids."""
    places = geo.org_places(CONFIG / "org_places.csv")
    land = geo.land_path(CONFIG / "world-110m.json")
    clusters = {}
    unplaced = []
    basis = Counter()
    for i, n in nodes.items():
        if n["kind"] != "org":
            continue
        cnt = agg[i].n if i in agg else 0
        if not cnt:
            continue
        d = n.get("data") or {}
        loc = places.get(n["slug"])
        iso = (loc or {}).get("iso3") or d.get("country")
        e = econ.get(iso or "")
        if not iso or not e or not e.get("lat"):
            unplaced.append([i, cnt])
            continue
        city = (loc or {}).get("city") if (loc or {}).get("lat") is not None else None
        lat, lon = (loc["lat"], loc["lon"]) if city else (float(e["lat"]), float(e["lon"]))
        basis[(loc or {}).get("basis") or "atlas"] += 1
        key = f"{iso}|{city or ''}"
        c = clusters.setdefault(key, {"iso": iso, "city": city, "lat": lat, "lon": lon, "orgs": []})
        c["orgs"].append([i, cnt, d.get("type") or "other"])
    out_c = []
    for c in clusters.values():
        c["orgs"].sort(key=lambda x: -x[1])
        x, y = geo.project(c["lon"], c["lat"])
        e = econ[c["iso"]]
        out_c.append({"x": x, "y": y, "iso": c["iso"], "city": c["city"], "cen": e["name_en"], "cko": e.get("name_ko") or None,
                      "n": sum(o[1] for o in c["orgs"]), "orgs": c["orgs"]})
    out_c.sort(key=lambda c: -c["n"])
    pl = []
    for i, n in nodes.items():
        if n["kind"] != "place":
            continue
        cnt = agg[i].n if i in agg else 0
        e = econ.get(n["key"])
        if (n.get("data") or {}).get("region") == "Region" or not e or not e.get("lat"):
            pl.append({"id": i, "n": cnt, "group": True})
            continue
        x, y = geo.project(float(e["lon"]), float(e["lat"]))
        pl.append({"id": i, "n": cnt, "x": x, "y": y})
    unplaced.sort(key=lambda x: -x[1])
    return {"w": geo.W, "h": geo.H, "views": geo.views(), "land": land, "clusters": out_c, "places": pl, "unplaced": unplaced,
            "basis": dict(basis), "placed": sum(len(c["orgs"]) for c in out_c)}


def people_index(nodes, agg, affs, pst, ref):
    """The People search index, per page language: {y1, affs: [labels], rows: [[slug, name, affiliation index or -1,
    documents, last 24 months, speeches, first year, documents a year from then (trailing zero years left off)]]}."""
    y1 = int(ref[:4])
    out = {"en": {"y1": y1, "affs": [], "rows": []}, "ko": {"y1": y1, "affs": [], "rows": []}}
    aix = {"en": {}, "ko": {}}

    def ai(lang, x):
        if not x:
            return -1
        if x not in aix[lang]:
            aix[lang][x] = len(out[lang]["affs"])
            out[lang]["affs"].append(x)
        return aix[lang][x]
    people = sorted((i for i, n in nodes.items() if n["kind"] == "person" and i in agg and agg[i].n), key=lambda i: -agg[i].n)
    for p in people:
        n = nodes[p]
        a = (affs.get(p) or {}).get("latest")
        o = nodes.get(a["org"]) if a and a.get("org") else None
        aff_en = (o["en"] if o else a.get("name")) if a else ""
        aff_ko = ((o.get("ko") or o["en"]) if o else a.get("name")) if a else ""
        ys = pst["years"].get(p) or {}
        y0 = min(ys) if ys else y1
        y0 = max(y0, 1970)
        series = [ys.get(y, 0) for y in range(y0, y1 + 1)]
        while series and not series[-1]:
            series.pop()
        for lang, aff in (("en", aff_en), ("ko", aff_ko)):
            out[lang]["rows"].append([n["slug"], n["en"], ai(lang, aff), agg[p].n, pst["n24"][p], pst["sp"][p], y0, series])
    return out


def unit_labels():
    """Each unit's label as the About page's units table prints it: the app's UNIT map (app/lib/i18n.ts), read rather
    than copied so the two cannot drift; the page falls back to the unit id, and so does this."""
    try:
        m = re.search(r"export const UNIT: Record<string, string> = \{(.*?)\n\};", UNIT_LABELS.read_text(encoding="utf-8"), re.S)
    except OSError:
        return {}
    return dict(re.findall(r"(\w+): '([^']*)'", m.group(1))) if m else {}


def raw_bytes(path):
    """Bytes of the regular files under one unit's raw folder (the files as collected, symlinks not followed);
    None when the folder is missing or cannot be read."""
    if not path.is_dir():
        return None

    def fail(e):
        raise e
    total = 0
    try:
        for d, _, files in os.walk(path, onerror=fail):
            for f in files:
                st = os.lstat(os.path.join(d, f))
                if stat.S_ISREG(st.st_mode):
                    total += st.st_size
    except OSError:
        return None
    return total


def volume(units):
    """What the datasteg.com Data chart draws for open-research: documents per unit as counted
    for this build (the About page's units table) and the size of each unit's raw folder. Measured, never estimated:
    a folder that cannot be read gives bytes null, and then the total is null too."""
    t = time.time()
    labels = unit_labels()
    rows = [{"id": u, "label": labels.get(u, u), "documents": n, "bytes": raw_bytes(SOURCES / u / "data" / "raw")}
            for u, n in sorted(units.items(), key=lambda x: -x[1])]
    missing = [r["id"] for r in rows if r["bytes"] is None]
    if missing:
        print(f"volume: no readable raw folder for {', '.join(missing)}", file=sys.stderr)
    print(f"volume: measured {len(rows)} raw folders in {time.time() - t:.1f} s", file=sys.stderr)
    return {"measured_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "row_is": "document with a profile card", "bytes_are": "raw files as collected",
            "read_from": str(SOURCES / "<unit>" / "data" / "raw"), "units": rows,
            "documents": sum(r["documents"] for r in rows),
            "bytes": None if missing else sum(r["bytes"] for r in rows)}


def volume_only(out):
    """Add `volume` to an existing data/meta.json, from the units of the data/atlas.sqlite it describes; nothing else
    is read from the surface or rewritten (atlas.sqlite stays as built)."""
    small = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    db = sqlite3.connect(f"file:{out / 'atlas.sqlite'}?mode=ro", uri=True)
    meta = json.loads(db.execute("SELECT v FROM meta WHERE k = 'meta'").fetchone()[0])
    db.close()
    if meta["built"] != small["built"]:
        raise SystemExit(f"meta.json (built {small['built']}) does not describe atlas.sqlite (built {meta['built']})")
    small["volume"] = volume(meta["units"])
    tmp = out / "meta.json.tmp"
    tmp.write_text(json.dumps(small, ensure_ascii=False, indent=1))
    os.replace(tmp, out / "meta.json")
    v = small["volume"]
    print(json.dumps({"built": small["built"], "documents": v["documents"], "bytes": v["bytes"], "units": len(v["units"])}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--surface", default=os.environ.get("ATLAS_SURFACE", str(ROOT / "surface")))
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--volume-only", action="store_true", help="only add `volume` to the existing meta.json in --out")
    args = ap.parse_args()
    if args.volume_only:
        return volume_only(Path(args.out))
    t0 = time.time()
    src = Path(args.surface).resolve()
    surface = json.load(open(src / "surface.json"))
    if surface["surface"].split(".")[0] != SURFACE_MAJOR:
        raise SystemExit(f"surface {surface['surface']} at {src}: this build reads major version {SURFACE_MAJOR}")
    if not surface["checks"].get("ok"):
        raise SystemExit("the surface's own checks failed; not building")

    nodes = {n["id"]: n for n in rd(src / "nodes.jsonl.zst")}
    edges = list(rd(src / "edges.jsonl.zst"))
    redirects = list(rd(src / "redirects.jsonl.zst"))
    changes = list(rd(src / "changes.jsonl.zst"))
    docs = list(rd(src / "docs.jsonl.zst"))
    print(f"read {len(nodes)} nodes, {len(docs)} docs from {src} in {time.time() - t0:.0f} s", file=sys.stderr)
    econ = geo.economies(CONFIG / "economies.csv")
    clean_names(nodes, docs, econ)

    kind_of = {i: n["kind"] for i, n in nodes.items()}
    # structure
    topic_grove = {}
    concept_topics = defaultdict(list)
    concept_broader = {}
    org_parent = {}
    for e in edges:
        s, d, r = e["src"], e["dst"], e["rel"]
        if r == "in" and kind_of.get(s) == "topic":
            topic_grove[s] = d
        elif r == "in" and kind_of.get(s) == "concept":
            concept_topics[s].append((d, e["w"]))
        elif r == "broader":
            concept_broader[s] = d
        elif r == "part_of" and kind_of.get(s) == "org":
            org_parent[s] = d
    jel_by_code = {n["key"]: i for i, n in nodes.items() if n["kind"] == "jel"}
    jel_parent = {}
    for i, n in nodes.items():
        if n["kind"] == "jel":
            code = n["key"]
            par = code[:-1] if len(code) > 1 else None
            if par and par in jel_by_code:
                jel_parent[i] = jel_by_code[par]

    def up(i, parent):
        out = []
        while i in parent:
            i = parent[i]
            out.append(i)
        return out

    # documents → memberships and aggregates
    agg = defaultdict(Agg)
    dn = []
    rows_out = []
    fts_docs = []
    fam_index = {f: k for k, f in enumerate(FAMS)}
    decades = Counter()
    years_all = defaultdict(lambda: [0, 0, 0, 0])
    fams = Counter()
    kinds = Counter()
    for idx, d in enumerate(docs, start=1):
        fi = fam_index.get(d["family"], 1)
        date = d.get("date") or "0000-00-00"
        topics = [t for t, _ in d["topics"]]
        groves = list(dict.fromkeys(topic_grove[t] for t in topics if t in topic_grove))
        concepts = list(dict.fromkeys(k["c"] for k in d["keywords"] if k.get("c")))
        stated = set(d["jel_stated"])
        jel_s = set()
        for j in stated:
            jel_s.add(j)
            jel_s.update(up(j, jel_parent))
        jel_i = set()
        for j, conf in d["jel_inferred"]:
            if (conf or 0) >= 0.5:
                jel_i.add(j)
                jel_i.update(up(j, jel_parent))
        jel_i -= jel_s
        persons = list(dict.fromkeys([a["p"] for a in d["authors"] if a.get("p")] + ([d["speaker"]["p"]] if d.get("speaker") and d["speaker"].get("p") else [])))
        orgs = list(dict.fromkeys(([d["publisher"]] if d.get("publisher") else []) + [o for o, _ in d["orgs"]]))
        orgs_up = set()
        for o in orgs:
            orgs_up.update(up(o, org_parent))
        orgs_up -= set(orgs)
        places = d["places"]
        rels = {"topic": topics, "concept": concepts, "org": orgs, "person": persons, "place": places,
                "jel": [j for j in jel_s if len(nodes[j]["key"]) == 3]}
        member = ([(t, 0 if k == 0 else 1) for k, t in enumerate(topics)] + [(g, 0) for g in groves] + [(c, 0) for c in concepts]
                  + [(j, 0) for j in jel_s] + [(j, 1) for j in jel_i] + [(o, 0) for o in orgs] + [(o, 1) for o in orgs_up]
                  + [(p, 0) for p in persons] + [(p, 0) for p in places])
        for node, r in member:
            dn.append((node, date, idx, r))
            agg[node].add(d, fi, rels)
        y = date[:4]
        if y.isdigit() and YEAR0 - 3 <= int(y) <= dt.date.today().year:   # a date in the future is a source error (one Research Hub card says 2035)
            decades[f"{y[:3]}0s"] += 1
        fams[d["family"]] += 1
        if y.isdigit():
            years_all[y][fi] += 1
        kinds[d.get("kind") or "paper"] += 1
        names = list(dict.fromkeys([a["name"] for a in d["authors"]] + ([d["speaker"]["name"]] if d.get("speaker") else [])))
        located = sum(1 for k in d["keywords"] if k.get("located"))
        row = {"s": d["slug"], "t": d["title"], "d": d.get("date"), "k": d.get("kind"), "f": d["family"], "u": d["unit"],
               "se": d.get("series"), "no": d.get("number"), "a": names[:4], "an": len(names), "kw": [located, len(d["keywords"])],
               "tp": topics[:1]}
        gap = days_between(d.get("date"), d.get("received"))
        rows_out.append((idx, d["slug"], d.get("date"), d.get("received"), d["family"], d.get("kind"), d["unit"], group_key(d),
                         title_lang(d.get("title")), 1 if gap is not None and gap > 90 else 0, br(row), br(d)))
        kw_text = " ".join(k["label"] for k in d["keywords"])
        fts_docs.append((idx, d.get("title") or "", " ".join(names), kw_text))
    print(f"memberships: {len(dn)}", file=sys.stderr)

    # node pages
    def top(c, n=TOP):
        return [[i, k] for i, k in c.most_common(n)]

    labels = {i: (n["en"], n["ko"]) for i, n in nodes.items()}
    node_rows = []
    children = defaultdict(list)
    for i, n in nodes.items():
        if n["kind"] == "topic" and i in topic_grove:
            children[topic_grove[i]].append(i)
        elif n["kind"] == "concept":
            if i in concept_broader:
                children[concept_broader[i]].append(i)
        elif n["kind"] == "jel" and i in jel_parent:
            children[jel_parent[i]].append(i)
        elif n["kind"] == "org" and i in org_parent:
            children[org_parent[i]].append(i)
    topic_concepts = defaultdict(list)
    for c, ts in concept_topics.items():
        for t, w in ts:
            topic_concepts[t].append((c, w))
    total_docs = len(docs)
    topic_n = {t: agg[t].n for t in nodes if kind_of[t] == "topic"}
    for i, n in nodes.items():
        a = agg.get(i) or Agg()
        page = {"years": {str(y): v for y, v in sorted(a.years.items())}, "kinds": dict(a.kinds),
                "rel": {k: top(c, 40 if k == "concept" else 16) for k, c in a.rel.items()}}
        page["rel"].get("topic") and page["rel"].update(topic=[x for x in page["rel"]["topic"] if x[0] != i][:16])
        page["rel"].get("concept") and page["rel"].update(concept=[x for x in page["rel"]["concept"] if x[0] != i][:40])
        page["rel"].get("org") and page["rel"].update(org=[x for x in page["rel"]["org"] if x[0] != i][:16])
        page["rel"].get("person") and page["rel"].update(person=[x for x in page["rel"]["person"] if x[0] != i][:16])
        kids = children.get(i, [])
        page["children"] = sorted(([k, agg[k].n if k in agg else 0] for k in kids), key=lambda x: -x[1])[:200]
        data = n.get("data") or {}
        page["data"] = data
        if n["kind"] == "topic":
            tc = sorted(topic_concepts.get(i, []), key=lambda x: -(agg[x[0]].n if x[0] in agg else 0))
            page["concepts"] = [[c, agg[c].n if c in agg else 0, w, (nodes[c]["data"] or {}).get("kind"), concept_broader.get(c)] for c, w in tc][:300]
            # co-topics by lift: P(other | this) / P(other)
            co = []
            for t2, k in a.rel.get("topic", Counter()).items():
                if t2 == i or not topic_n.get(t2):
                    continue
                lift = (k / max(a.n, 1)) / (topic_n[t2] / total_docs)
                co.append([t2, k, round(lift, 1)])
            page["cotopics"] = sorted(co, key=lambda x: -x[2])[:10]
            page["grove"] = topic_grove.get(i)
        if n["kind"] == "concept":
            page["topics"] = [[t, w] for t, w in concept_topics.get(i, [])]
            page["broader"] = concept_broader.get(i)
        if n["kind"] == "org":
            page["parent"] = org_parent.get(i)
        if n["kind"] == "jel":
            page["parent"] = jel_parent.get(i)
        node_rows.append([i, n["kind"], n["slug"], n["en"], n["ko"], page.get("parent") or page.get("grove") or topic_grove.get(i), a.n, page])

    affs = affiliations(docs, nodes)
    ref = max((d.get("received") or "" for d in docs), default="") or dt.date.today().isoformat()
    grove_x, pst, econ_out = review2_stats(docs, nodes, agg, topic_grove, econ, ref)
    dups = near_duplicates(nodes, agg)
    (Path(args.out) / "merge_candidates.json").parent.mkdir(parents=True, exist_ok=True)
    (Path(args.out) / "merge_candidates.json").write_text(json.dumps(
        [{"sub": g["sub"], "labels": [[nodes[m]["en"], agg[m].n if m in agg else 0, nodes[m]["slug"]] for m in g["members"]]} for g in dups],
        ensure_ascii=False, indent=1))
    print(f"affiliations: {len(affs)} people, {Counter(a['tier'] for a in affs.values())}; near-duplicate groups {len(dups)}", file=sys.stderr)

    # JEL: stated and inferred counts kept apart (O10)
    jel_counts = defaultdict(lambda: [0, 0])
    for node, _, _, r in dn:
        if kind_of.get(node) == "jel":
            jel_counts[node][r] += 1
    for row in node_rows:
        if row[1] == "jel":
            row[7]["stated_n"], row[7]["inferred_n"] = jel_counts[row[0]]
            row[6] = jel_counts[row[0]][0] + jel_counts[row[0]][1]
            row[7]["children"] = sorted(([k, jel_counts[k][0], jel_counts[k][1]] for k in children.get(row[0], [])), key=lambda x: x[0])

    # write
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    tmp = out / "atlas.sqlite.tmp"
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    db.executescript("""
      PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA page_size = 8192;
      CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE nodes (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, slug TEXT NOT NULL, en TEXT, ko TEXT, parent INTEGER, n INTEGER NOT NULL, sub TEXT, page BLOB);
      CREATE TABLE docs (idx INTEGER PRIMARY KEY, slug TEXT NOT NULL, date TEXT, received TEXT, family TEXT, kind TEXT, unit TEXT, grp TEXT, lang TEXT, bf INTEGER NOT NULL, row BLOB NOT NULL, card BLOB NOT NULL);
      CREATE TABLE pstats (person INTEGER PRIMARY KEY, n INTEGER NOT NULL, n24 INTEGER NOT NULL, sp INTEGER NOT NULL);
      CREATE TABLE econ (iso TEXT PRIMARY KEY, data BLOB NOT NULL);
      CREATE TABLE dn (node INTEGER NOT NULL, date TEXT NOT NULL, idx INTEGER NOT NULL, r INTEGER NOT NULL, PRIMARY KEY (node, date, idx)) WITHOUT ROWID;
      CREATE TABLE redirects (kind TEXT NOT NULL, slug TEXT NOT NULL, to_kind TEXT, to_slug TEXT, PRIMARY KEY (kind, slug)) WITHOUT ROWID;
      CREATE VIRTUAL TABLE docs_fts USING fts5(title, names, concepts, tokenize = 'unicode61 remove_diacritics 2');
      CREATE VIRTUAL TABLE nodes_fts USING fts5(label, label_ko, tokenize = 'unicode61 remove_diacritics 2');
      CREATE TABLE aff (person INTEGER PRIMARY KEY, org INTEGER, name TEXT, year INTEGER, tier TEXT NOT NULL, n INTEGER NOT NULL);
      CREATE TABLE dups (id INTEGER PRIMARY KEY, head INTEGER NOT NULL, sub TEXT NOT NULL);
    """)
    def sub(r):
        d = r[7].get("data") or {}
        return d.get("kind") if r[1] == "concept" else d.get("type") if r[1] == "org" else d.get("region") if r[1] == "place" else None
    for r in node_rows:
        if r[1] == "person" and r[0] in affs:
            r[7]["aff"] = affs[r[0]]
    db.executemany("INSERT INTO aff VALUES (?,?,?,?,?,?)", [(p, a["latest"]["org"], a["latest"]["name"], a["latest"]["year"], a["tier"], agg[p].n if p in agg else 0)
                                                     for p, a in affs.items() if kind_of.get(p) == "person"])
    db.execute("CREATE INDEX aff_org ON aff (org, n DESC)")
    db.executemany("INSERT INTO dups VALUES (?,?,?)", [(m, g["head"], g["sub"]) for g in dups for m in g["members"]])
    db.executemany("INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?)", [r[:7] + [sub(r), br(r[7])] for r in node_rows])
    db.execute("CREATE INDEX nodes_kind_sub_n ON nodes (kind, sub, n DESC)")
    db.execute("CREATE UNIQUE INDEX nodes_kind_slug ON nodes (kind, slug)")
    db.execute("CREATE INDEX nodes_kind_n ON nodes (kind, n DESC)")
    db.executemany("INSERT INTO docs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows_out)
    db.execute("CREATE UNIQUE INDEX docs_slug ON docs (slug)")
    db.execute("CREATE INDEX docs_received ON docs (received DESC, idx)")
    db.execute("CREATE INDEX docs_date ON docs (date DESC, idx)")
    db.executemany("INSERT INTO pstats VALUES (?,?,?,?)", [(p, agg[p].n, pst["n24"][p], pst["sp"][p]) for p in nodes if kind_of[p] == "person" and p in agg])
    db.execute("CREATE INDEX pstats_n24 ON pstats (n24 DESC)")
    db.executemany("INSERT INTO econ VALUES (?, ?)", [(iso, br(v)) for iso, v in econ_out.items()])
    db.executemany("INSERT OR IGNORE INTO dn VALUES (?,?,?,?)", dn)
    red = []
    for r in redirects:
        to = nodes.get(r["to"]) if r.get("to") else None
        red.append((r["kind"], r["slug"], to["kind"] if to else None, to["slug"] if to else None))
    # A person node left empty because its name only differed by an HTML entity redirects to its decoded twin (O5);
    # the next release merges them for good.
    live_person = {}
    for r in node_rows:
        if r[1] == "person" and r[6] > 0:
            live_person.setdefault(r[3], r)
    empty_twins = {r[0]: live_person[r[3]] for r in node_rows if r[1] == "person" and r[6] == 0 and r[3] in live_person}
    for i, to in empty_twins.items():
        red.append(("person", nodes[i]["slug"], "person", to[2]))
    db.execute(f"DELETE FROM nodes WHERE id IN ({','.join(map(str, empty_twins)) or '0'})")
    db.executemany("INSERT OR IGNORE INTO redirects VALUES (?,?,?,?)", red)
    db.executemany("INSERT INTO docs_fts (rowid, title, names, concepts) VALUES (?,?,?,?)", fts_docs)
    db.executemany("INSERT INTO nodes_fts (rowid, label, label_ko) VALUES (?,?,?)",
                   [(i, n["en"] or "", n["ko"] or "") for i, n in nodes.items() if n["kind"] in ("grove", "topic", "concept", "org", "person", "place", "jel")])
    db.execute("INSERT INTO docs_fts (docs_fts) VALUES ('optimize')")
    db.execute("INSERT INTO nodes_fts (nodes_fts) VALUES ('optimize')")

    # meta: what the home page and the footer need
    received = sorted((d.get("received") or "" for d in docs), reverse=True)
    latest = received[0] if received else None
    week_ago = (dt.date.fromisoformat(latest) - dt.timedelta(days=6)).isoformat() if latest else None
    month_ago = (dt.date.fromisoformat(latest) - dt.timedelta(days=29)).isoformat() if latest else None
    groves = []
    for i, n in nodes.items():
        if n["kind"] == "grove":
            a = agg.get(i) or Agg()
            tps = sorted(children.get(i, []), key=lambda t: -(agg[t].n if t in agg else 0))
            groves.append({"id": i, "slug": n["slug"], "en": n["en"], "ko": n["ko"], "n": a.n,
                           "desc_en": (n.get("data") or {}).get("desc_en"), "desc_ko": (n.get("data") or {}).get("desc_ko"),
                           "years": {str(y): sum(v) for y, v in sorted(a.years.items())},
                           "topics": [[t, nodes[t]["slug"], nodes[t]["en"], nodes[t]["ko"], agg[t].n if t in agg else 0] for t in tps], **grove_x.get(i, {})})
    grove_order = [n["key"] for n in nodes.values() if n["kind"] == "grove"]
    meta = {
        "built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "surface": {k: surface[k] for k in ("surface", "builder", "release", "release_accepted", "built", "content", "cards_builder", "counts")},
        "docs": len(docs), "families": dict(fams), "kinds": dict(kinds), "decades": dict(sorted(decades.items())),
        "nodes": dict(Counter(n["kind"] for n in nodes.values())),
        "latest_received": latest, "new_week": sum(1 for r in received if week_ago and r >= week_ago),
        "new_month": sum(1 for r in received if month_ago and r >= month_ago),
        "groves": groves, "grove_order": grove_order, "years": dict(sorted(years_all.items())),
        "units": dict(Counter(d["unit"] for d in docs)),
        "changes": changes[:200],
        "unplaced": surface["counts"].get("unplaced"),
    }
    mp = map_blob(nodes, agg, econ)
    meta["map"] = {"placed": mp["placed"], "unplaced": len(mp["unplaced"]), "basis": mp["basis"]}
    meta["aff"] = dict(Counter(a["tier"] for p, a in affs.items() if kind_of.get(p) == "person"))
    pidx = people_index(nodes, agg, affs, pst, ref)
    tiles = tiles_blob(econ_out, econ, nodes)
    meta["ref"] = ref
    meta["volume"] = volume(meta["units"])
    db.executemany("INSERT INTO meta VALUES (?, ?)", [("meta", json.dumps(meta, ensure_ascii=False)), ("map", json.dumps(mp, ensure_ascii=False, separators=(",", ":"))),
                                                     ("tiles", json.dumps(tiles, ensure_ascii=False, separators=(",", ":"))),
                                                     *[(f"pindex_{l}", json.dumps(v, ensure_ascii=False, separators=(",", ":"))) for l, v in pidx.items()]])
    db.commit()
    db.execute("ANALYZE")
    db.commit()
    db.execute("VACUUM")
    db.close()
    os.replace(tmp, out / "atlas.sqlite")
    small = {k: meta[k] for k in ("built", "surface", "docs", "nodes", "latest_received", "volume")}
    (out / "meta.json").write_text(json.dumps(small, ensure_ascii=False, indent=1))
    size = (out / "atlas.sqlite").stat().st_size
    print(json.dumps({"built": meta["built"], "release": surface["release"], "surface_built": surface["built"], "docs": len(docs),
                      "nodes": len(nodes), "memberships": len(dn), "sqlite_mb": round(size / 1e6, 1), "seconds": round(time.time() - t0)}))


if __name__ == "__main__":
    main()
