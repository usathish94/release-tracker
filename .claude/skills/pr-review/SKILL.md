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

Structure the review as:

```markdown
## Summary
<1-3 sentence overview of what the PR/MR does and your overall take>

## Findings
### Blocking
- `path/to/file.js:42` — <issue and why it matters>

### Suggestions
- `path/to/file.js:10` — <issue>

### Nits
- `path/to/file.js:5` — <issue>

(omit any section with nothing in it — if there are no findings at all, say so plainly instead of inventing filler comments)
```

## 5. Posting the review back

**Interactive session (a person is driving)**: show the review in chat first and ask before posting anything to the PR/MR — posting a comment is a visible, hard-to-fully-undo action on a shared system.

**Unattended CI run** (invoked by a `pull_request`/`merge_request` pipeline, no human in the loop this turn): posting is the entire point of the job, so post automatically once the review is complete — that authorization comes from the person who set up the CI workflow, not from this session. Still, only ever **comment**. Never approve, request-changes-block, merge, or push commits — a human makes those calls.

GitHub:
```bash
gh pr comment <N> --body-file <review.md>
```

GitLab, with `glab` available (local use):
```bash
glab mr note <N> --message-file <review.md>
```

GitLab in CI without `glab` installed — use the REST API directly with the job's own token (no extra credentials needed for same-project MRs):
```bash
curl --request POST \
  --header "JOB-TOKEN: $CI_JOB_TOKEN" \
  --form "body=<review.md" \
  "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes"
```

## Guardrails

- Never approve, merge, or close the PR/MR, and never push commits to it — this skill comments only.
- If the diff contains what looks like a real secret or credential, flag *that it exists and where*, but don't echo the secret value itself into the posted comment.
- Don't execute code introduced by the diff to "test" it — read it, don't run untrusted changes.
- If the diff is too large to review meaningfully in one pass, say so and review the highest-risk files first rather than skimming everything shallowly.
