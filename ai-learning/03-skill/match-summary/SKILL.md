---
name: match-summary
description: Turn raw cricket match JSON (teams, score, overs, status) into a short, human-readable summary. Use when the user asks to "summarize this match" or pastes match score JSON and wants a readable recap.
---

# Match Summary

You will be given raw match data, usually JSON shaped like:

```json
{ "teams": "India vs Australia", "score": "287/4", "overs": "45.2", "status": "live" }
```

## What to do

1. Read the `status` field first — it changes the tone:
   - `live` → write in present tense, note it's ongoing.
   - `completed` → write in past tense, announce the result.
   - `upcoming` → say when it starts, don't invent a score.
2. Produce exactly 2 sentences: one stating the current score/situation, one
   giving quick context (e.g. run rate if overs are known, or "chasing a big
   total" if score is high).
3. Never invent details not present in the input (player names, venue,
   weather) unless they were actually given to you.
4. If required fields are missing, say what's missing instead of guessing.

## Example

Input: `{ "teams": "England vs South Africa", "score": "150 all out", "overs": "38.0", "status": "completed" }`

Output:
> England vs South Africa has finished, with the chasing/bowled-out side
> closing on 150 all out in 38.0 overs. That's a low total for a completed
> innings — bowlers had the upper hand.
