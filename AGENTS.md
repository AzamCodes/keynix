<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository guidance

- Read `PROJECT_CONTEXT.md` before making significant changes. Confirm important details against the current implementation; do not rely on prior reports alone.
- Treat Keynix as security-sensitive password-manager software. Preserve existing functionality unless a change is explicitly requested, and keep changes minimal and reviewable.
- Never expose secrets or inspect environment-variable values unless strictly necessary. Do not use real credentials.
- Never run database migrations against Production without explicit approval. Never deploy, push commits, or change production settings without approval.
- After making changes, run the relevant tests and builds, and report exactly what was run and what remains unverified.
- Explain security implications of changes. Passing tests do not establish that the application is secure.
