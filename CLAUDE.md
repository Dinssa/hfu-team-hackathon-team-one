# Team One: Share rebuild (HFU Hackathon 2026)

Read fully before writing code. The full brief is in the sibling repo `../hfu-hackathon-2026/` (MILESTONES.md, DATA.md, GLOSSARY.md, milestones/*.md). Read those when a milestone needs them; never build there.

## Rules for the AI

- AI writes the code here. Edit and Write are allowed in this repo. The human reviews, runs and commits.
- Never run `git commit`, `git push` or `git add`. Draft commit messages as text.
- Never look at or search for the real Share codebase. Build from the brief only. Do not invoke any `hfu-*` skills in this repo.
- No real authentication. Roles are a "sign in as" picker (M6).
- No Docker, no background workers, no build step.
- When a milestone's acceptance criteria all pass, stop and report. Do not gold-plate.
- Do not run linters, formatters or test suites unprompted. Ask first.
- Never invent records. Everything comes from `data/incoming/`. Unmatched rows go to `raw.rejected_rows`, never crash.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node 24, ES modules |
| Web | Express 5, `src/app.js` |
| Templates | Nunjucks + official `govuk-frontend` macros. Search path: `src/views`, then `node_modules/govuk-frontend/dist` so `{% from "govuk/components/x/macro.njk" import govukX %}` works |
| Data | DuckDB file `data/share.duckdb` via `@duckdb/node-api`. Helpers in `src/db.js`: `run`, `all`, `one`, `ensureSchema` |
| Schema | `src/schema.sql`, idempotent, two schemas: `raw` (files as received) and `serve` (what the app reads) |
| Ingest | `npm run ingest` processes the next unprocessed file in number order. Also a button on the home page |
| Inspection | `duckdb data/share.duckdb -ui` or `duckdb data/share.duckdb -readonly` |

Commands: `npm run dev` (watch mode on http://localhost:3000), `npm run ingest`, `npm run snapshot` (Parquet export to `data/reporting/`).

## DuckDB rules

- Only the app process writes to `data/share.duckdb`. Anyone else opens read-only or reads the Parquet snapshots.
- No foreign key constraints. UNIQUE only on immutable keys (`submission_guid`, `dedupe_key`, `row_hash`). Never UPDATE a UNIQUE column.
- Positional parameters: `$1, $2, ...`. Use `all(sql, [params])` and `run(sql, [params])` from `src/db.js`.
- Idempotency comes from `INSERT ... ON CONFLICT DO NOTHING` on those keys. Re-running any file must leave row counts unchanged.

## Data facts (from DATA.md)

- Applications (JSON, odd files): array of submissions. `submissionGUID`, `application.uniqueApplicationNumber` (UAN), `application.eventDateTime`, `person[]`. Person 1 is the lead applicant. All details are `questions[]` matched on exact `title`.
- Arrivals (CSV): `WEBVAF` is the GWF. Join GWF first, UAN fallback. Files are cumulative. Same reference may repeat with different decisions.
- Visa status: Issued or GRANT with arrival datetime = Arrived; without = Issued; Withdrawn; Refused; Voided = Confirmed; never updated = Pending. Precedence on conflict: Arrived > Issued > Withdrawn > Refused > Confirmed.
- Case = applications sharing sponsor and accommodation address. Council comes from the accommodation.
- Any guest under 18 on a case means check 3 needs an Enhanced DBS.

## Status wording (one tag per status, words never colour alone)

- Visa: Pending, Issued, Arrived, Withdrawn, Refused, Confirmed
- Check: Not Started, In Progress, Passed, Failed, No Longer Required
- Case: Checks Required, Checks Partially Completed, Pre-arrival Checks Complete, Checks Completed, Some Checks Failed

Render every status through `src/views/components/status-tag.njk`.

## Page quality bar

- One `h1` per page. `pageTitle` set on every render; layout appends the service name.
- Every form input has a visible label. Errors use `govukErrorSummary` linking to the field.
- Tables have a caption. Links between related records everywhere, both directions.
- Status conveyed by words. Keyboard reachable. No personal data in page titles.

## Layout

```
src/app.js            express + nunjucks setup, mounts routes
src/db.js             DuckDB helpers
src/schema.sql        tables
src/ingest/           index.js (next file), applications.js, arrivals.js, status.js
src/routes/           one router per record type
src/views/            layout.njk, components/, one folder per record type
data/incoming/        the 20 hackathon files, copied, never edited
```
