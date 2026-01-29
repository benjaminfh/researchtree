## Global design decisions
- All text forms submit on cmd+Enter if form state is valid.
- Icons must come from Blueprint JS

## Ref identity (git-first)
- Treat ref names as the default identifier everywhere; preserve git-like mutable names.
- Use immutable `ref.id` only where a stable FK/join is required (artefact, leases, DB joins).
- Never assume `ref.name` is an FK; resolve display labels from refs.

## Feature branches
master and dev branches are protected. Create a feature branch to work using the format codex/{yyyyMMdd}/a-clear-descriptive-title

## Product Management
We plan and track progress in PM_DOCS/
We track feature requets and bugs in Github Issues
Issue creation process:
- Generate a title from the description of the issue provided by the user; issue body should contain only additive, useful, descriptive info. Do not repeat the title/name, labels, status, or PM_DOCS source refs in the body. Iterate with the user if the issue description seems unclear to you (or would be unhelpful to an engineer picking up the issue later).
- Labels: FRs -> `enhancement`; BUGS -> `bug`. Add one of `ui`, `server`, `database` when applicable.
- Status handling: open items stay open. If marked done, close as `completed`. If marked [o]/won't do, close as `not planned`. Use `gh issue create` then `gh issue close --reason ...`.

## Supabase migration files
 - The file MUST be named in the format YYYYMMDDHHmmss_short_description.sql with proper casing for months, minutes, and seconds in UTC time.

## Git Commits & PRs
- When writing commit messages, always note the type of change (fix, chore, etc.) and then write a 1-2 sentence summary as well as detailed bullet points of the changes made. You can be thorough here.

- When using gh pr create -b, pass a real multi‑line string, not \n literals. The safest way is:
    - Use $'...' and real \n escapes (Bash/Zsh), or
    - Put the body in a temp file and use -F file.md.

## E2E Testing with Playwright
When embarking on Playwright configuration (design, testing, debugging), please consult PM_DOCS/PLAYWRIGHT_SOP.md before starting.
