#!/usr/bin/env python3
"""Rebuild data.js for the standalone co-op map.

Downloads the ArcGIS item "America Electrical Coop Service Territories",
joins HIFLD TYPE on name + state, drops municipals / public power districts /
PUDs, and writes data.js. Open index.html directly; no local server.

Raw responses are stored under cache/ so later builds can reprocess
territories without downloading them again. Prefer `make build`.

    make fetch      # download into cache/ (skipped when the cache is complete)
    make content    # data.js from the cache only
    make build      # frontend files + data.js
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from shapely.errors import GEOSException
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from filter import is_us_electric_coop

_ROOT = Path(__file__).resolve().parent
_DEFAULT_OUT = _ROOT / "data.js"
_DEFAULT_CACHE = _ROOT / "cache"

_COOP_QUERY = (
    "https://services5.arcgis.com/ARxOqVFcodl7rmzw/arcgis/rest/services/"
    "America_Electrical_Coop_Service_Territories/FeatureServer/10/query"
)
_HIFLD_QUERY = (
    "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/"
    "Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query"
)
_SOURCE_ITEM = "a249744f9f5e494d917086c023e9a8f1"
_FIELDS = "FID,NAME,STATE,CITY,ADDRESS,ZIP,TELEPHONE,WEBSITE"


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Cache file is unreadable: {path} ({exc})") from exc


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _hifld_path(cache: Path) -> Path:
    return cache / "hifld-types.json"


def _attributes_path(cache: Path) -> Path:
    return cache / "coop-attributes.json"


def _geo_path(cache: Path, state: str) -> Path:
    return cache / "geo" / f"{state}.geojson"


def _stamp_path(cache: Path) -> Path:
    return cache / ".complete"


def _fetch_json(url: str, params: dict[str, str]) -> dict:
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{url}?{query}",
        headers={"User-Agent": "coopmap"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        payload = json.load(resp)
    # ArcGIS reports query errors as HTTP 200 with an "error" body.
    if isinstance(payload, dict) and "error" in payload:
        raise SystemExit(f"ArcGIS query failed: {url} {payload['error']}")
    return payload


def _fetch_attributes(url: str, fields: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        payload = _fetch_json(
            url,
            {
                "where": "1=1",
                "outFields": fields,
                "returnGeometry": "false",
                "resultRecordCount": "2000",
                "resultOffset": str(offset),
                "f": "json",
            },
        )
        feats = payload.get("features") or []
        rows.extend(feat["attributes"] for feat in feats)
        if not feats or (
            not payload.get("exceededTransferLimit") and len(feats) < 2000
        ):
            break
        offset += len(feats)
    return rows


def _hifld_types(rows: list[dict]) -> dict[tuple[str, str], set[str]]:
    grouped: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in rows:
        name = (row.get("NAME") or "").strip().upper()
        state = (row.get("STATE") or "").strip().upper()
        grouped[(name, state)].add((row.get("TYPE") or "").strip().upper())
    return grouped


def _utility_type(types: set[str] | None) -> str | None:
    if not types:
        return None
    if "COOPERATIVE" in types:
        return "COOPERATIVE"
    real = types - {"NOT AVAILABLE", ""}
    if not real:
        return "NOT AVAILABLE"
    return sorted(real)[0]


def _fetch_state_geojson(state: str) -> list[dict]:
    if not re.fullmatch(r"[A-Z]{2}", state):
        raise ValueError(f"unexpected state code: {state!r}")
    payload = _fetch_json(
        _COOP_QUERY,
        {
            "where": f"STATE='{state}'",
            "outFields": _FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "geometryPrecision": "5",
        },
    )
    return payload.get("features") or []


def _round_coords(coords, ndigits: int):
    if isinstance(coords, (list, tuple)):
        if coords and isinstance(coords[0], (int, float)):
            return [round(float(coords[0]), ndigits), round(float(coords[1]), ndigits)]
        return [_round_coords(part, ndigits) for part in coords]
    return coords


def _polygonal(geom):
    """Drop linework that ``make_valid`` sometimes leaves behind."""
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    parts = []
    for part in getattr(geom, "geoms", ()):
        poly = _polygonal(part)
        if poly is not None and not poly.is_empty:
            parts.append(poly)
    if not parts:
        return None
    return unary_union(parts)


def _clean(geom):
    if geom.is_empty:
        return None
    try:
        valid = geom.is_valid
    except GEOSException:
        valid = False
    if not valid:
        try:
            geom = make_valid(geom)
        except GEOSException:
            try:
                geom = geom.buffer(0)
            except GEOSException:
                return None
    return _polygonal(geom)


def _simplify(geometry: dict, tolerance: float) -> dict | None:
    geom = _clean(shape(geometry))
    if geom is None or geom.is_empty:
        return None
    geom = geom.simplify(tolerance, preserve_topology=True)
    geom = _polygonal(geom)
    if geom is None or geom.is_empty:
        return None
    mapped = mapping(geom)
    mapped["coordinates"] = _round_coords(mapped["coordinates"], 4)
    return mapped


_MISSING = frozenset({"NOT AVAILABLE", "N/A", "NA", "NONE", "NULL", "-"})


def _blank(value) -> str | None:
    text = (value or "").strip()
    if not text or text.upper() in _MISSING:
        return None
    return text


def _states_from_rows(rows: list[dict]) -> list[str]:
    return sorted(
        {
            (row.get("STATE") or "").strip().upper()
            for row in rows
            if (row.get("STATE") or "").strip()
        }
    )


def _load_or_fetch(path: Path, label: str, fetch, *, refresh: bool, offline: bool):
    if path.exists() and not refresh:
        print(f"Using cached {label}", flush=True)
        return _read_json(path)
    if offline:
        raise SystemExit(f"Missing {path}. Run `make fetch` first.")
    print(f"Fetching {label}…", flush=True)
    payload = fetch()
    _write_json(path, payload)
    return payload


def load_sources(cache: Path, *, refresh: bool, offline: bool) -> tuple[list[dict], list[dict], dict[str, list[dict]]]:
    """Return HIFLD rows, co-op attribute rows, and per-state GeoJSON features."""
    hifld_rows = _load_or_fetch(
        _hifld_path(cache),
        "HIFLD types",
        lambda: _fetch_attributes(_HIFLD_QUERY, "NAME,STATE,TYPE"),
        refresh=refresh,
        offline=offline,
    )
    source_rows = _load_or_fetch(
        _attributes_path(cache),
        "co-op extract attributes",
        lambda: _fetch_attributes(_COOP_QUERY, _FIELDS),
        refresh=refresh,
        offline=offline,
    )
    states = _states_from_rows(source_rows)
    if not states:
        raise SystemExit("Co-op attribute cache has no states.")
    print(f"Geometry for {len(states)} states", flush=True)

    features_by_state: dict[str, list[dict]] = {}
    for state in states:
        features_by_state[state] = _load_or_fetch(
            _geo_path(cache, state),
            f"{state} geometry",
            lambda state=state: _fetch_state_geojson(state),
            refresh=refresh,
            offline=offline,
        )
    if not offline:
        _write_json(
            _stamp_path(cache),
            {
                "states": states,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        print(f"Cache ready at {cache}", flush=True)
    return hifld_rows, source_rows, features_by_state


def build(
    tolerance: float,
    hifld_rows: list[dict],
    features_by_state: dict[str, list[dict]],
) -> tuple[dict, list[str]]:
    types = _hifld_types(hifld_rows)

    kept: list[dict] = []
    dropped: list[str] = []
    for state in sorted(features_by_state):
        for feature in features_by_state[state]:
            props = feature.get("properties") or {}
            name = props.get("NAME") or ""
            feature_state = (props.get("STATE") or "").strip()
            key = (name.strip().upper(), feature_state.upper())
            utility_type = _utility_type(types.get(key))
            if not is_us_electric_coop(name, utility_type):
                dropped.append(f"{feature_state:4} {utility_type or 'unmatched':28} {name}")
                continue
            geometry = feature.get("geometry")
            if not geometry:
                dropped.append(f"{feature_state:4} {'NO GEOMETRY':28} {name}")
                continue
            simplified = _simplify(geometry, tolerance)
            if simplified is None:
                dropped.append(f"{feature_state:4} {'EMPTY GEOMETRY':28} {name}")
                continue
            kept.append(
                {
                    "type": "Feature",
                    "id": props.get("FID"),
                    "properties": {
                        "name": name.strip(),
                        "state": feature_state,
                        "city": _blank(props.get("CITY")),
                        "address": _blank(props.get("ADDRESS")),
                        "zip": _blank(props.get("ZIP")),
                        "telephone": _blank(props.get("TELEPHONE")),
                        "website": _blank(props.get("WEBSITE")),
                        "utility_type": _blank(utility_type),
                    },
                    "geometry": simplified,
                }
            )
        print(f"  {state}: {len(kept)} kept so far", flush=True)

    kept.sort(key=lambda feat: (feat["properties"]["state"], feat["properties"]["name"]))
    collection = {
        "type": "FeatureCollection",
        "name": "US electric cooperatives",
        "source_item": _SOURCE_ITEM,
        "source_url": (
            "https://www.arcgis.com/home/item.html?id=" + _SOURCE_ITEM
        ),
        "simplify_tolerance_deg": tolerance,
        "count": len(kept),
        "features": kept,
    }
    return collection, dropped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=_DEFAULT_OUT)
    parser.add_argument("--cache", type=Path, default=_DEFAULT_CACHE)
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.0015,
        help="Shapely simplify tolerance in degrees (default 0.0015, ~170 m)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print kept/dropped counts without writing data.js",
    )
    parser.add_argument(
        "--fetch-only",
        action="store_true",
        help="Download into the cache and exit without writing data.js",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Build data.js from the cache only; fail if a download is missing",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-download cached extracts",
    )
    args = parser.parse_args(argv)
    if args.offline and args.refresh:
        parser.error("--offline and --refresh cannot be combined")
    if args.offline and args.fetch_only:
        parser.error("--offline and --fetch-only cannot be combined")

    hifld_rows, _source_rows, features_by_state = load_sources(
        args.cache,
        refresh=args.refresh,
        offline=args.offline,
    )
    if args.fetch_only:
        return 0

    collection, dropped = build(args.tolerance, hifld_rows, features_by_state)
    print(f"Kept {collection['count']}", flush=True)
    print(f"Dropped {len(dropped)}", flush=True)
    for line in dropped:
        print(f"  drop {line}")
    if args.dry_run:
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(collection, separators=(",", ":"))
    args.output.write_text(
        "window.COOP_TERRITORIES = " + text + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {args.output} ({args.output.stat().st_size / 1_000_000:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
