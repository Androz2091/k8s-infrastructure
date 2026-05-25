---
name: bump-k8s-image
description: Open a PR in Androz2091/k8s-infrastructure that bumps a Deployment's image tag to the SHA of the latest successful Docker build for the current repo. Use when the user wants to deploy a freshly-pushed change ("bump the image", "open a PR to k8s-infra", "deploy the latest", "ship this to prod"). Polls until the CI build succeeds, finds the manifest via grep, opens a PR but does NOT merge it.
---

# Bump k8s image

Bumps the image tag in `Androz2091/k8s-infrastructure` for a freshly-built commit and opens a PR. Mirrors the manual flow we've used before — branch name, commit message, and PR title all follow the existing `chore(<repo>): bump image to sha-<short>` convention.

## When to use

User says something like:
- "open a PR to k8s-infra"
- "bump the bonds image"
- "deploy this"
- "ship the latest to the cluster"

## When NOT to use

- The user wants to bump to a *specific* SHA that isn't the latest CI success — just edit the manifest directly.
- The repo isn't deployed via `Androz2091/k8s-infrastructure` (grep step will find nothing).

## Flow

### 1. Identify the source repo

Read the current working directory's git remote:

```bash
git remote get-url origin
```

Extract the repo name (e.g. `Androz2091/bonds` → repo = `bonds`). If the origin isn't an `Androz2091/*` repo, stop and tell the user — this skill targets that org.

### 2. Find the latest successful CI build

Get the head SHA of the local branch's most recent commit:

```bash
git rev-parse HEAD                     # full SHA
git rev-parse --short=7 HEAD           # short SHA used in image tags
```

Then check the CI status for that specific SHA:

```bash
gh run list --repo Androz2091/<repo> --commit <full-sha> --limit 5
```

**Decide based on what you see:**

- **Status `completed` + `success`** → image is ready, proceed to step 3.
- **Status `in_progress` or `queued`** → poll with `gh run watch <run-id> --exit-status`. That command streams progress and exits 0 on success, non-zero on failure. Use Bash's `run_in_background` if it would take more than a minute or two.
- **Status `completed` + `failure`** → stop and surface the failure to the user. Do not bump to a SHA whose image doesn't exist.
- **No run found** → the CI hasn't picked up the commit yet. Wait 30s and re-check once; if still nothing, ask the user whether to wait longer or stop.

If multiple runs exist for the SHA, filter to the workflow that publishes the image (usually named something like `ci`, `docker`, `build`, or `release`). Inspect `.github/workflows/` in the source repo if uncertain — look for one using `docker/build-push-action` or equivalent.

### 3. Clone k8s-infrastructure fresh in /tmp

Always re-clone — never trust a stale checkout:

```bash
rm -rf /tmp/k8s-infrastructure
git clone https://github.com/Androz2091/k8s-infrastructure.git /tmp/k8s-infrastructure
```

### 4. Find the manifest via grep

Grep for the current image string. Default registry path is `docker.io/androz2091/<repo>:sha-`:

```bash
grep -rln "androz2091/<repo>:sha-" /tmp/k8s-infrastructure/
```

- **One match** → that's the manifest. Read it to get the current tag.
- **Multiple matches** → list them and ask the user which to bump.
- **No matches** → the repo isn't deployed via this k8s-infrastructure. Stop and tell the user.

If the current tag already equals `sha-<short>`, stop — nothing to do.

### 5. Make the change

```bash
cd /tmp/k8s-infrastructure
git checkout -b chore/<repo>-bump-<short-sha>
```

Use the **Edit** tool on the manifest to swap the old SHA for the new one. Don't use sed — Edit gives the user a reviewable diff.

### 6. Commit

Match the existing commit-message style — check `git log --oneline -- <manifest>` to confirm:

```
chore(<repo>): bump image to sha-<short-sha>[ (<short context>)]
```

The parenthetical context is optional. Add it when there's a single descriptive theme (e.g. "upstream merge", "vault delete fix", "clean post-debug"). Skip it for routine bumps.

Use HEREDOC for the commit body so multi-line formatting works:

```bash
git commit -m "$(cat <<'EOF'
chore(<repo>): bump image to sha-<short-sha> (<context>)

<one paragraph: what this commit brings in, with a link to the source commit
(Androz2091/<repo>@<short-sha>)>
EOF
)"
```

### 7. Push and open the PR

```bash
git push -u origin chore/<repo>-bump-<short-sha>
```

Open the PR with `gh pr create`. Title matches the commit subject. Body uses the standard Summary + Test plan template:

```bash
gh pr create --title "chore(<repo>): bump image to sha-<short-sha>[ (<context>)]" --body "$(cat <<'EOF'
## Summary
- Bumps <repo> image from `sha-<old>` to `sha-<new>`.
- <one or two bullets describing what's in this commit>.
- Source: Androz2091/<repo>@<short-sha>.

## Test plan
- [ ] ArgoCD picks up the new image and rolls out cleanly.
- [ ] Liveness / readiness probes pass after rollout.
- [ ] Smoke-check the specific behavior this bump enables.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Do not merge the PR.** Report the URL back to the user and stop — they review and merge.

## Conventions worth preserving

- Branch name: `chore/<repo>-bump-<short-sha>` (no trailing context, even when the commit subject has one).
- Image tag format: `docker.io/androz2091/<repo>:sha-<7-char-short-sha>`. The docker/metadata-action default is 7 chars; don't accidentally use 8.
- Test plan checklist items use `- [ ]`, not `- [x]`.

## Failure modes to handle gracefully

- **Not in a git repo / origin isn't Androz2091**: stop, explain.
- **CI build failed**: surface the failing run URL, do not bump.
- **Tag already current**: report "already at sha-<short>, nothing to do" and exit cleanly.
- **Multiple matching manifests**: list paths and ask which to update.
- **`gh` not authenticated**: tell the user to run `gh auth login` themselves (don't try to auth on their behalf).
