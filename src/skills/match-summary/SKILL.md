---
name: match-summary
description: Turn raw cricket match JSON (teams, score, overs, status) into a short, human-readable summary. Use when the user asks to "summarize this match" or pastes match score JSON and wants a readable recap.
---

# Match Summary

You will be given raw match data, usually JSON shaped like:

```json
{ "teams": "India vs Australia", "score": "287/4", "overs": "45.2", "status": "live" }
```

## Voice

Write like an energetic sports broadcaster calling the action — punchy,
exciting, a little breathless — but never at the expense of accuracy. Every
word of excitement must be earned by the actual numbers in the input; don't
manufacture drama for a routine score.

## What to do

1. Read the `status` field first — it changes the tone:
   - `live` → present tense, build tension around what's happening right now.
   - `completed` → past tense, announce the result with a clear reaction to
     how it went (rout, nail-biter, dominant total, collapse, etc.).
   - `upcoming` → build anticipation for the start, don't invent a score.
2. Produce exactly 2 sentences: one stating the current score/situation with
   energy, one giving quick context (run rate, momentum, what the number
   means for the match) — still grounded in the actual data.
3. Never invent details not present in the input (player names, venue,
   weather) unless they were actually given to you. Energy comes from
   phrasing, never from fabricated specifics.
4. If required fields are missing (e.g. `score` is `null`), say so plainly
   instead of guessing — don't let the broadcaster voice paper over missing
   data.

## Examples

Input: `{ "teams": "India vs Australia", "score": "287/4", "overs": "45.2", "status": "live" }`

Output:
> India vs Australia is heating up — India have raced to 287/4 through 45.2
> overs and look firmly in control. At well over 6 an over, this innings is
> building toward a genuinely big total.

Input: `{ "teams": "England vs South Africa", "score": "150 all out", "overs": "38.0", "status": "completed" }`

Output:
> England vs South Africa is in the books, and South Africa's bowlers ran
> riot — England were bowled out for just 150 in 38.0 overs. That's a real
> collapse, and the bowling side will be thrilled with the result.

Input: `{ "teams": "New Zealand vs Pakistan", "score": null, "overs": null, "status": "upcoming" }`

Output:
> New Zealand and Pakistan are gearing up for a clash — first ball hasn't
> been bowled yet, so no score to report just yet. Stay tuned, this one's
> coming soon.

Input: `{ "teams": "Australia vs India", "score": null, "overs": "12.4", "status": "live" }`

Output:
> Australia vs India is live and in progress — 12.4 overs bowled, but the
> score isn't available yet, so we can't call this one until the numbers
> come through.

More examples covering a range of scores and edge cases are in
`sample-dataset.jsonl` alongside this file — useful as a regression set when
tweaking this prompt further.
