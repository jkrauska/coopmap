"""Keep distribution cooperatives out of the US electric-territory extract.

The ArcGIS item "America Electrical Coop Service Territories" is already a
co-op-oriented slice of HIFLD retail territories (about 830 polygons), but it
still includes municipals, public power districts, PUDs, and a few tribal or
state utilities. HIFLD ``TYPE`` is joined on name + state when it exists.
Many co-ops are typed ``NOT AVAILABLE``, so a missing type is kept unless the
name is clearly something else.
"""

from __future__ import annotations

import re

# HIFLD Electric Retail Service Territories ``TYPE`` values that are not
# distribution cooperatives.
NON_COOP_TYPES = frozenset(
    {
        "MUNICIPAL",
        "INVESTOR OWNED",
        "POLITICAL SUBDIVISION",
        "STATE",
        "FEDERAL",
        "MUNICIPAL MKTG AUTHORITY",
        "COMMUNITY CHOICE AGGREGATOR",
        "WHOLESALE POWER MARKETER",
    }
)

# Names that show up in the co-op extract but are not cooperatives.
# Great Plains Energy is an investor-owned holding company (now Evergy).
_EXCLUDED_NAMES = frozenset({"GREAT PLAINS ENERGY"})

# Public power, municipal, PUD, and tribal/state utility authorities.
# Mississippi "E P A" (electric power association) is a co-op and must stay.
_NON_COOP_NAME = re.compile(
    r"(?:"
    r"\b(?:city|village|town)\s+of\b"
    r"|\bmunicipal\b"
    r"|public\s+power"
    r"|public\s+pwr"
    r"|\bpub\s+pwr"
    r"|\bp\s*\.?\s*p\s*\.?\s*d\b"
    r"|\bp\s*\.?\s*u\s*\.?\s*d\b"
    r"|public\s+utilit"
    r"|power\s+dist"
    r"|electrical\s+dist"
    r"|utility\s+authority"
    r"|\bm\s*\.?\s*p\s*\.?\s*a\b"
    r")",
    re.IGNORECASE,
)


def _norm_name(name: str | None) -> str:
    return re.sub(r"\s+", " ", (name or "").strip()).upper()


def is_us_electric_coop(name: str | None, utility_type: str | None = None) -> bool:
    """Return True when a territory from the co-op extract should be shown.

    ``utility_type`` is the HIFLD ``TYPE`` for the same name and state, or
    None when HIFLD has no match. An explicit non-coop type is always
    dropped. ``COOPERATIVE`` and missing types are kept unless the name is
    a municipal, public-power district, PUD, or similar.
    """
    if _norm_name(name) in _EXCLUDED_NAMES:
        return False
    if _NON_COOP_NAME.search(name or ""):
        return False
    kind = (utility_type or "").strip().upper()
    if kind in NON_COOP_TYPES:
        return False
    return True
