#!/usr/bin/env python3
"""
Computes exact run rate / required run rate for a match-summary input, so the
skill doesn't rely on the model's mental arithmetic for numbers that end up in
front of a user. Run inside the Skill's code-execution container as:

    python3 scripts/run_rate.py '{"score": "287/4", "overs": "45.2", "status": "live", "target": 350, "total_overs": 50}'

`score` may be "R/W" (e.g. "287/4") or "R all out" (e.g. "150 all out").
`target` and `total_overs` are optional - required-rate is only printed if
both are present.

Stdlib only, deliberately: the code-execution container has no internet
access, so a runtime `pip install` for a formatting nicety fails outright
(confirmed empirically - see scripts/demo-run-with-code-execution.mjs's
comment header) rather than being merely slow. A Skill script needs to work
every run, not just when a package happens to already be cached.
"""
import json
import re
import sys


def parse_runs_wickets(score):
    if score is None:
        return None, None
    all_out = re.match(r"(\d+)\s+all out", score)
    if all_out:
        return int(all_out.group(1)), 10
    split = re.match(r"(\d+)/(\d+)", score)
    if split:
        return int(split.group(1)), int(split.group(2))
    return None, None


def main():
    print("Run rate main")
    data = json.loads(sys.argv[1])
    runs, wickets = parse_runs_wickets(data.get("score"))
    overs = float(data.get("overs")) if data.get("overs") is not None else None
    target = data.get("target")
    total_overs = data.get("total_overs")

    rows = [("Score", data.get("score") or "unavailable"), ("Overs", overs if overs is not None else "unavailable")]

    if runs is not None and overs:
        rows.append(("Run rate", round(runs / overs, 2)))

    if target is not None and total_overs is not None and overs is not None and runs is not None:
        overs_remaining = round(total_overs - overs, 2)
        runs_needed = target - runs
        if overs_remaining > 0:
            rows.append(("Runs needed", runs_needed))
            rows.append(("Overs remaining", overs_remaining))
            rows.append(("Required rate", round(runs_needed / overs_remaining, 2)))

    width = max(len(label) for label, _ in rows)
    for label, value in rows:
        print(f"{label:<{width}} : {value}")


if __name__ == "__main__":
    main()
