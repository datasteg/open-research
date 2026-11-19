"""geo.py — the map page's geometry, computed once at build time.

Land outlines come from Natural Earth 110m (public domain; config/world-110m.json, the TopoJSON trade-flow serves),
projected with Equal Earth into a 1000-wide SVG viewBox. Country centroids come from config/economies.csv (the same
codes as money-flow, trade-flow and global-network). Organisation headquarters come from config/org_places.csv
(slug, iso3, city, lat, lon, basis), falling back to the atlas's own country; an organisation with neither is listed
as unplaced, never guessed.
"""
import csv
import json
import math
from pathlib import Path

A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2
W = 1000
LAT_MIN = -57.0          # Antarctica and the far south are left off


def _ee(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    p = math.asin(M * math.sin(phi))
    p2 = p * p
    p6 = p2 * p2 * p2
    x = lam * math.cos(p) / (M * (A1 + 3 * A2 * p2 + p6 * (7 * A3 + 9 * A4 * p2)))
    y = p * (A1 + A2 * p2 + p6 * (A3 + A4 * p2))
    return x, y


_XMAX = _ee(180, 0)[0]
_YTOP = _ee(0, 84)[1]
_YBOT = _ee(0, LAT_MIN)[1]
_S = W / (2 * _XMAX)
H = round((_YTOP - _YBOT) * _S)


def project(lon, lat):
    x, y = _ee(lon, max(min(lat, 84), LAT_MIN))
    return round((x + _XMAX) * _S, 1), round((_YTOP - y) * _S, 1)


def land_path(topo_path):
    topo = json.load(open(topo_path))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(ix):
        pts = []
        for i in ix:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(a[1:] if pts else a)
        return pts

    out = []
    for g in topo["objects"]["countries"]["geometries"]:
        if g.get("id") == "010":          # Antarctica
            continue
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]] if g["type"] == "Polygon" else []
        for poly in polys:
            for r in poly:
                pts = [project(lon, lat) for lon, lat in ring(r)]
                keep = []
                for p in pts:
                    if not keep or abs(p[0] - keep[-1][0]) + abs(p[1] - keep[-1][1]) >= 0.9:
                        keep.append(p)
                if len(keep) < 3:
                    continue
                # a ring that crosses the antimeridian (Russia, Fiji) jumps across the map: break it there, unclosed
                parts, cur = [], [keep[0]]
                for p in keep[1:]:
                    if abs(p[0] - cur[-1][0]) > W / 3:
                        parts.append(cur)
                        cur = []
                    cur.append(p)
                parts.append(cur)
                if len(parts) == 1:
                    out.append("M" + "L".join(f"{x:g},{y:g}" for x, y in keep) + "Z")
                else:
                    out.extend("M" + "L".join(f"{x:g},{y:g}" for x, y in q) for q in parts if len(q) > 1)
    return "".join(out)


def economies(path):
    rows = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows[r["code"].strip()] = {k: (v or "").strip() for k, v in r.items()}
    return rows


def org_places(path):
    if not Path(path).exists():
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            iso = (r.get("iso3") or "").strip().upper()
            if not iso:
                continue
            lat, lon = (r.get("lat") or "").strip(), (r.get("lon") or "").strip()
            out[r["slug"].strip()] = {"iso3": iso, "city": (r.get("city") or "").strip() or None,
                                      "lat": float(lat) if lat else None, "lon": float(lon) if lon else None,
                                      "basis": (r.get("basis") or "").strip() or None}
    return out


VIEWS = {"europe": (-12, 34, 34, 62), "namerica": (-126, 18, -62, 52), "easia": (92, -10, 152, 46)}


def views():
    """Zoom boxes (x, y, w, h in the map's viewBox) for the quick-zoom chips: lon0, lat0, lon1, lat1 → projected bounds."""
    out = {}
    for k, (lo0, la0, lo1, la1) in VIEWS.items():
        pts = [project(lo, la) for lo in (lo0, (lo0 + lo1) / 2, lo1) for la in (la0, la1)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        w, h = x1 - x0, y1 - y0
        if w / h < W / H:                      # keep the map's aspect ratio
            nw = h * W / H
            x0, w = x0 - (nw - w) / 2, nw
        else:
            nh = w * H / W
            y0, h = y0 - (nh - h) / 2, nh
        out[k] = [round(x0, 1), round(y0, 1), round(w, 1), round(h, 1)]
    return out
