---
name: pr-review
description: Review an open pull request (GitHub) or merge request (GitLab) — fetch its diff, check it for bugs, security issues, missing tests, and style problems, then post the findings back as a comment. Use when asked to "review this PR", "review PR #N", "review the MR", or when running unattended in a CI job triggered by a pull_request / merge_request event.
---

# PR / MR Review

Reviews the diff of an open pull request or merge request and reports findings — optionally posting them back to the platform. Works on both GitHub and GitLab; GitHub is the primary, better-tested path.

## 1. Detect the platform and the PR/MR identity

Figure out which platform and which PR/MR before doing anything else:

- **Explicit target**: if given a URL or `#N` / `!N`, use that directly.
- **GitHub CI**: `GITHUB_REPOSITORY` and a PR number are available via the event context (in Actions, the workflow prompt passes the PR number explicitly — use it).
- **GitLab CI**: `CI_PROJECT_PATH`, `CI_PROJECT_ID`, and `CI_MERGE_REQUEST_IID` are set automatically on merge request pipelines.
- **Interactive, no target given**: run `git remote get-url origin` to see whether it's a `github.com` or `gitlab.com`/self-hosted GitLab remote, then look up the open PR/MR for the current branch (`gh pr view` / `glab mr view`, no args, uses the current branch).

If neither an explicit target nor CI context nor a resolvable current-branch PR/MR exists, ask which one to review instead of guessing.

## 2. Gather context

**GitHub** (via `gh`, already authenticated in Actions runners):
```bash
gh pr view <N> --json title,body,baseRefName,headRefName,author,files
gh pr diff <N>
```

**GitLab** (via `glab` locally, or the REST API directly in CI — see §5):
```bash
glab mr view <N>
glab mr diff <N>
```

Also read:
- Any repo-root `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` for project-specific conventions.
- The full contents of changed files (not just the diff hunks) when a change's correctness depends on surrounding code you can't see in the patch context.
- Linked issues in the PR/MR description, if any, for the intent behind the change.

## 3. Review checklist

Go through changed files against each of these; skip categories that don't apply rather than forcing a comment:

1. **Correctness** — logic errors, off-by-ones, unhandled edge cases, race conditions, incorrect error handling, broken null/undefined checks.
2. **Security** — injection (SQL/command/XSS), secrets or credentials committed in the diff, missing auth/authz checks, unsafe deserialization, SSRF-prone URL handling, insecure defaults.
3. **Tests** — does the change need test coverage it doesn't have? Do existing tests still make sense given the change?
4. **API/breaking changes** — public interfaces, DB schema, config, or webhook payload shapes changed in a way that breaks callers.
5. **Simplification** — dead code, unnecessary abstraction, duplicated logic that already exists elsewhere in the repo.
6. **Consistency** — does the change follow the same patterns as neighboring code (naming, error handling, module structure)?

For each finding, note severity (blocking / suggestion / nit) and cite the exact `file:line`.

## 4. Report format

Prefer **one comment per finding, attached to the exact diff line it's about** — not one big summary comment. Each finding stands alone:

```
[Blocking|Suggestion|Nit] <the issue and why it matters, in 1-3 sentences>
```

Keep each one short enough to read at a glance on that line. If there are zero findings, don't invent filler — post a single short top-level comment saying the diff looked clean instead of going line-by-line.

## 5. Posting the review back

**Interactive session (a person is driving)**: show the findings in chat first and ask before posting anything to the PR/MR — posting comments is a visible, hard-to-fully-undo action on a shared system.

**Unattended CI run** (invoked by a `pull_request`/`merge_request` pipeline, no human in the loop this turn): posting is the entire point of the job, so post automatically once the review is complete — that authorization comes from the person who set up the CI workflow, not from this session. Still, only ever **comment**. Never approve, request-changes-block, merge, or push commits — a human makes those calls.

**GitHub, per-line (preferred)** — when the `mcp__github_inline_comment__create_inline_comment` tool is available (it's auto-loaded for `pull_request`-triggered CI runs), call it once per finding with the file path, line number, and the finding's text. It attaches directly to that diff line without touching approval state.

**GitHub, no inline tool available (e.g. interactive/local use)** — build one PR review with an inline comment per finding instead of separate top-level comments:
```bash
gh api repos/{owner}/{repo}/pulls/<N>/reviews -X POST \
  -f event=COMMENT \
  -f 'comments[][path]=path/to/file.js' -F 'comments[][line]=42' -f 'comments[][body]=<finding text>' \
  # repeat the comments[] triplet per finding
```
If there's nothing to flag, skip the review and just do `gh pr comment <N> --body-file <review.md>` with a short "looks clean" note.

**GitLab, per-line** — use the discussions API with a `position` object so the note anchors to the diff line (needs `base_sha`/`start_sha`/`head_sha` from the MR's diff refs, and `new_path`/`new_line`):
```bash
curl --request POST \
  --header "JOB-TOKEN: $CI_JOB_TOKEN" \
  --form "body=<finding text>" \
  --form "position[position_type]=text" \
  --form "position[base_sha]=<base_sha>" --form "position[start_sha]=<start_sha>" --form "position[head_sha]=<head_sha>" \
  --form "position[new_path]=path/to/file.js" --form "position[new_line]=42" \
  "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/discussions"
```
`glab` (local use) doesn't have a dedicated inline-note command, so use `glab api` the same way, or fall back to one `glab mr note <N> --message-file <review.md>` if per-line positioning isn't worth the overhead for a small MR.

## Guardrails

- Never approve, merge, or close the PR/MR, and never push commits to it — this skill comments only.
- If the diff contains what looks like a real secret or credential, flag *that it exists and where*, but don't echo the secret value itself into the posted comment.
- Don't execute code introduced by the diff to "test" it — read it, don't run untrusted changes.
- If the diff is too large to review meaningfully in one pass, say so and review the highest-risk files first rather than skimming everything shallowly.
