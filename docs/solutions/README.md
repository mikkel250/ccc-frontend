# Solutions

Documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas. Created by `/ce-compound`.

## Bootstrapped from companion CCC

| File | Why it's here |
|------|----------------|
| [mid-tier-review-models-match-frontier-at-7x-cost.md](./mid-tier-review-models-match-frontier-at-7x-cost.md) | Model tier guidance referenced by `AGENTS.md` |
| [fork-repo-branches-before-local-changes.md](./fork-repo-branches-before-local-changes.md) | Git/workflow safety when working across forks |
| [better-auth-empty-ip-headers-share-one-preauth-bucket.md](./better-auth-empty-ip-headers-share-one-preauth-bucket.md) | Empty `ipAddressHeaders` (not `disableIpTracking`) for a non-spoofable shared pre-auth counter |

Backend-only learnings (tracers, Redis, curator prompts) stay in CCC unless they affect this BFF.
