"""tilegrid.py — lay the economies out as a tile grid map (one equal square per economy, near its real position).

  uv run --with scipy==1.17.1 scripts/tilegrid.py [--print]      # writes config/tile_grid.csv (iso3,col,row)

Run once per atlas release that adds economies; the output is committed and can be edited by hand. Positions: each
economy's centroid (config/economies.csv) in Equal Earth, with Europe and the Caribbean spread out (they hold many small
economies), scaled to a grid; then an optimal one-to-one assignment of economies to cells (scipy's linear_sum_assignment,
squared distance), so every economy lands as close to its place as the others allow. Deterministic.

Pacific-centred: longitudes are turned so that CENTRE (Korea) sits mid-map and the seam runs through
the Atlantic. Europe and Africa fall to the left, the Americas to the right, and the Pacific islands sit together beside
Oceania instead of being split between the two edges.
"""
import argparse
import csv
import math
import sqlite3
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

import geo

ROOT = Path(__file__).resolve().parents[1]
COLS, ROWS = 29, 17
# hand nudges after the assignment, applied only when the target cell is free: (iso3, dcol, drow)
NUDGE = [("CHN", 1, 0)]   # China beside Korea, not one empty cell away
CENTRE = 150   # map centre longitude: seam at 30°W, mid-Atlantic (Cabo Verde and Iceland on the left, Brazil and Greenland on the right)

# Regions where small economies crowd: (lon0, lat0, factor) spreads points away from a centre before gridding.
SPREAD = [(15, 50, 1.9), (-72, 16, 1.6), (40, 28, 1.25), (105, 8, 1.3), (20, 2, 1.15)]


def pos(lon, lat):
    for lon0, lat0, f in SPREAD:
        d = math.hypot((lon - lon0) * math.cos(math.radians(lat0)), lat - lat0)
        if d < 22:
            w = (1 - d / 22) ** 2
            k = 1 + (f - 1) * w
            lon, lat = lon0 + (lon - lon0) * k, lat0 + (lat - lat0) * k
    lon = (lon - CENTRE + 540) % 360 - 180
    # the open eastern Pacific (between the Cook Islands and Mexico) holds no economy: squeeze it so the Americas get room
    lon -= 0.55 * max(0.0, min(lon - 55, 45))
    return geo.project(lon, max(-50, min(75, lat)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true")
    ap.add_argument("--centre", type=float, default=None, help="map centre longitude (default CENTRE)")
    ap.add_argument("--db", default=str(ROOT / "data" / "atlas.sqlite"))
    args = ap.parse_args()
    if args.centre is not None:
        globals()["CENTRE"] = args.centre
    econ = geo.economies(ROOT / "config" / "economies.csv")
    have = {r[0] for r in sqlite3.connect(args.db).execute("SELECT slug FROM nodes WHERE kind = 'place' AND length(slug) = 3")}
    codes = sorted(c for c in have if econ.get(c, {}).get("lat"))
    pts = np.array([pos(float(econ[c]["lon"]), float(econ[c]["lat"])) for c in codes])
    x0, y0 = pts.min(0)
    x1, y1 = pts.max(0)
    gx = (pts[:, 0] - x0) / (x1 - x0) * (COLS - 1)
    gy = (pts[:, 1] - y0) / (y1 - y0) * (ROWS - 1)
    cells = np.array([(c, r) for r in range(ROWS) for c in range(COLS)], dtype=float)
    cost = (gx[:, None] - cells[None, :, 0]) ** 2 + (1.15 * (gy[:, None] - cells[None, :, 1])) ** 2
    ri, ci = linear_sum_assignment(cost)
    out = sorted(((codes[i], int(cells[j][0]), int(cells[j][1])) for i, j in zip(ri, ci)), key=lambda x: (x[2], x[1]))
    taken = {(c, r) for _, c, r in out}
    for iso, dc, dr in NUDGE:
        for i, (k, c, r) in enumerate(out):
            if k == iso and (c + dc, r + dr) not in taken:
                taken.discard((c, r)); taken.add((c + dc, r + dr)); out[i] = (k, c + dc, r + dr)
    # trim empty leading columns and rows
    mc, mr = min(o[1] for o in out), min(o[2] for o in out)
    out = [(c, col - mc, row - mr) for c, col, row in out]
    with open(ROOT / "config" / "tile_grid.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["iso3", "col", "row"])
        w.writerows(out)
    if args.print:
        grid = {(c, r): k for k, c, r in out}
        for r in range(max(o[2] for o in out) + 1):
            print(" ".join(grid.get((c, r), "...") for c in range(max(o[1] for o in out) + 1)))
    print(f"{len(out)} economies on a {max(o[1] for o in out) + 1} × {max(o[2] for o in out) + 1} grid")


if __name__ == "__main__":
    main()
