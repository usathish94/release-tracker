# 3. Skill

A **Skill** is not code — it's a `SKILL.md` file: a name, a description (used
to decide *when* to trigger it), and a body of instructions. No function
runs; Claude reads the instructions and follows them using whatever tools it
already has (here, none are even needed — it's pure reasoning over text you
give it).

Compare to folders 1 & 2: those give Claude a new *capability* (fetch a
score). This gives Claude a *procedure* for something it can already sort of
do (summarize text), but standardizes and constrains how, so you get
consistent output every time instead of whatever the model feels like.

## Try it

This skill (`match-summary`) is discoverable by Claude Code if you copy/symlink
it into `.claude/skills/`:

```bash
mkdir -p .claude/skills
cp -r ai-learning/03-skill/match-summary .claude/skills/match-summary
```

Then in a session, paste the example JSON from `SKILL.md` and ask
"summarize this match" — Claude should invoke the `match-summary` skill and
follow its rules (tense based on status, exactly 2 sentences, no invented
details) rather than free-styling.

## When to reach for a skill vs. a tool

- Need Claude to **fetch/compute** something it has no way to know (live
  score, DB row, API call)? → tool / MCP.
- Need Claude to **follow your house style** for a recurring task (summarize
  this way, format that way, always check X before Y)? → skill.
