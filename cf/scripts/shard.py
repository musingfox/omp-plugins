#!/usr/bin/env python3
"""Group contracts by touches_files overlap; order waves by depends."""
from __future__ import annotations

import json
import sys
from collections import defaultdict


def find(parent: dict[str, str], x: str) -> str:
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def main() -> None:
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: shard.py CONTRACTS.json\n")
        sys.exit(2)
    data = json.load(open(sys.argv[1]))
    contracts = data.get("contracts") or []
    if not contracts:
        json.dump({"shards": [], "waves": []}, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return

    parent = {c["name"]: c["name"] for c in contracts}

    def union(a: str, b: str) -> None:
        ra, rb = find(parent, a), find(parent, b)
        if ra != rb:
            parent[rb] = ra

    owners: dict[str, list[str]] = defaultdict(list)
    for c in contracts:
        for path in c.get("touches_files") or []:
            owners[path].append(c["name"])
    for names in owners.values():
        for n in names[1:]:
            union(names[0], n)

    groups: dict[str, list[str]] = defaultdict(list)
    for c in contracts:
        groups[find(parent, c["name"])].append(c["name"])
    shards = [
        {"id": f"s{i + 1}", "contracts": sorted(names)}
        for i, names in enumerate(sorted(groups.values(), key=lambda g: g[0]))
    ]
    shard_of = {n: s["id"] for s in shards for n in s["contracts"]}
    shard_deps: dict[str, set[str]] = defaultdict(set)
    for c in contracts:
        sid = shard_of[c["name"]]
        for dep in c.get("depends") or []:
            if dep in shard_of and shard_of[dep] != sid:
                shard_deps[sid].add(shard_of[dep])

    remaining = {s["id"] for s in shards}
    waves: list[list[str]] = []
    while remaining:
        ready = sorted(s for s in remaining if shard_deps[s].isdisjoint(remaining))
        if not ready:
            ready = sorted(remaining)
        waves.append(ready)
        remaining -= set(ready)

    json.dump({"shards": shards, "waves": waves}, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
