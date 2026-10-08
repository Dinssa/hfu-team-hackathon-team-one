# Haven (Team One)

Haven is a hackathon rebuild of Share, the casework service for the Homes for Ukraine scheme. All data is synthetic.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000.

Data files are processed automatically. While the app is running, every file in `data/incoming/visa_applications/` is ingested on start, and any new file dropped in is ingested within about a second. Only `visa_applications/` is ingested so far; the other feed folders are ignored until their milestones land.

To process pending files with the app stopped:

```
npm run ingest
```

Inspect the database, also while the app is stopped (DuckDB allows one process on the file at a time):

```
duckdb data/share.duckdb -readonly
```

## Stack

Node 24, Express 5, Nunjucks with the official GOV.UK Frontend macros, DuckDB as the single-file database.

## Milestone log

| Milestone | Status |
|---|---|
| M0 Setup | done |
| M1 Applications arrive | done |
| M2 People and places | done |
| M3 Build the case | done |
| M4 Safeguarding checks | |
| M5 Guests move | |
