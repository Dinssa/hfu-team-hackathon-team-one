# Haven: Team One Share rebuild (HFU Hackathon 2026)

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
| Templates | Nunjucks + official `govuk-frontend` macros + `@ministryofjustice/frontend` (MOJ) macros. Search path: `src/views`, `node_modules/govuk-frontend/dist`, `node_modules/@ministryofjustice/frontend`, so `govuk/components/x/macro.njk` and `moj/components/x/macro.njk` both resolve |
| List pages | MOJ filter panel via `{% call filterLayout({...}) %}` from `components/filter-panel.njk`. Routes build `filters` and `selectedFilters` with helpers in `src/lib/filters.js` |
| Detail pages | MOJ side navigation (`mojSideNavigation`) in a one-quarter column linking to section ids, content in three-quarters, GOV.UK summary cards per section |
| Footer | `govukFooter` macro in `layout.njk`, with OGL licence and crown |
| Data | DuckDB file `data/share.duckdb` via `@duckdb/node-api`. Helpers in `src/db.js`: `run`, `all`, `one`, `ensureSchema` |
| Schema | `src/schema.sql`, idempotent, two schemas: `raw` (files as received) and `serve` (what the app reads) |
| Ingest | `npm run ingest` processes the next unprocessed file, feed folder by feed folder (`HANDLERS` order in `src/ingest/index.js`), then by name. Also a button on the home page |
| Inspection | `duckdb data/share.duckdb -readonly` or `-ui`, only while the app is stopped. A running app holds an exclusive lock; nothing else can open the file, not even read-only. Analysts use the Parquet snapshots in `data/reporting/` |

Commands: `npm run dev` (watch mode on http://localhost:3000), `npm run ingest`, `npm run snapshot` (Parquet export to `data/reporting/`).

## DuckDB rules

- One process at a time owns `data/share.duckdb`. While `npm run dev` is running, `npm run ingest` and the `duckdb` CLI both fail with "Could not set lock". Use the home page button to ingest while the app runs; stop the app to use the CLI. Set `SHARE_DB=/some/path.duckdb` to point a command at a different database file, which is how tests and experiments avoid the lock.
- No foreign key constraints. UNIQUE only on immutable keys (`submission_guid`, `dedupe_key`, `row_hash`). Never UPDATE a UNIQUE column.
- Positional parameters: `$1, $2, ...`. Use `all(sql, [params])` and `run(sql, [params])` from `src/db.js`.
- Idempotency comes from `INSERT ... ON CONFLICT DO NOTHING` on those keys. Re-running any file must leave row counts unchanged.

## Data facts (from DATA.md)

- Applications (`data/incoming/visa_applications/*.json`): one `{ record }` per file. `record.id` (submission GUID), `event.application_ref` (UAN), `event.occurred_at`, `people[]`. Lead applicant has role `kind: lead_applicant`; sponsor has role `relationship: sponsor`. All details are `responses[]` matched on exact `section` + `prompt`. The GWF is the `GWF Number` response.
- Arrivals (`data/incoming/visa_arrivals/*.xlsx`): `VAF_REF` is the GWF. Join GWF first, `UAN` fallback. Files are cumulative. Same reference may repeat with different outcomes. Not ingested yet.
- Host offers (`eoi/`) and unaccompanied minors (`uam/`) are JSON, one record per file. Not ingested yet.
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
data/incoming/        one folder per feed (visa_applications, visa_arrivals, eoi, uam), never edited
```
