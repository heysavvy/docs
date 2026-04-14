# Embeddables docs (`heysavvy/docs`)

Internal guide for humans and AI assistants working on this repository. The published site is built with [Mintlify](https://mintlify.com/).

## Local development

1. Install Node.js (18.10+ recommended).
2. Install the Mintlify CLI: `npm i -g mintlify`.
3. From the repository root, run `mintlify dev` and open the local preview URL (default port 3000).

Use `mintlify dev --port <port>` if the default port is in use.

## Editing

- Page content lives in `.mdx` files; navigation and metadata are in `docs.json`.
- Follow the Mintlify component and frontmatter conventions described in `.cursor/rules/index.mdc` in this repo.

## Pull requests

- Base branch for new work: **`main`** (this repository’s default branch).
- Use the repository PR template at `.github/pull_request_template.md` when you write the PR description. GitHub pre-fills it when you open a PR from the web UI; if you use automation or the API, paste the same sections (Description, Changes, Tests, Related) so reviewers get consistent context.
- Link the driving **Linear** issue (for example `DEV-142`) in the Related section when the work came from Linear.

## Cursor Cloud agents

When a cloud agent runs against this repo (for example from a Linear assignment):

- Create a working branch off `main` and open a PR back into **`main`** unless the task explicitly names another base branch.
- Prefer branch names that match your team’s convention (for example `cursor/<short-description>-e2e4` when required by automation).
- Register or update the PR using the template structure above so the description is not empty or generic.
