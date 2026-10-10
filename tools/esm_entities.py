#!/usr/bin/env python3
"""Pull the game's own entity names out of Morrowind.esm: NPC full names and
cell names. These are the 'spine' that both guides get tagged against."""

import json
import os
import struct

# Your Morrowind folder (the one holding extracted/ and morrowmods/). Defaults to this repo's parent.
MW = os.environ.get("MORROWIND_DIR", os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ESM = os.path.join(MW, "extracted", "Data Files", "Morrowind.esm")
OUT = os.path.join(os.path.dirname(__file__), "entities.json")


def subrecords(data):
    off = 0
    while off + 8 <= len(data):
        tag = data[off:off + 4].decode("latin-1")
        size = struct.unpack_from("<I", data, off + 4)[0]
        yield tag, data[off + 8:off + 8 + size]
        off += 8 + size


def cstr(b):
    return b.split(b"\x00", 1)[0].decode("latin-1").strip()


def main():
    data = open(ESM, "rb").read()
    npcs, cells, counts = {}, set(), {}
    off = 0
    while off + 16 <= len(data):
        rtype = data[off:off + 4].decode("latin-1")
        size = struct.unpack_from("<I", data, off + 4)[0]
        rec = data[off + 16:off + 16 + size]
        off += 16 + size
        if rtype == "NPC_":
            sub = dict((t, v) for t, v in subrecords(rec) if t in ("NAME", "FNAM"))
            rid, name = cstr(sub.get("NAME", b"")), cstr(sub.get("FNAM", b""))
            if name:
                npcs.setdefault(name, rid)
                counts[name] = counts.get(name, 0) + 1
        elif rtype == "CELL":
            for t, v in subrecords(rec):
                if t == "NAME":
                    n = cstr(v)
                    if n:
                        cells.add(n)
                    break
    # Generic names ("Redoran Guard", "Ordinator"...) shared by many records aren't useful anchors.
    generic = sorted(n for n, c in counts.items() if c >= 3)
    for n in generic:
        npcs.pop(n)
    json.dump({"npcs": npcs, "cells": sorted(cells), "generic": generic}, open(OUT, "w"), indent=0)
    print(f"{len(npcs)} named NPCs ({len(generic)} generic names dropped), {len(cells)} named cells -> {OUT}")


if __name__ == "__main__":
    main()
