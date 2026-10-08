# Haven (Team One)

Haven is a hackathon rebuild of Share, the casework service for the Homes for Ukraine scheme. All data is synthetic.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000.

Process the next data file (one feed per folder in `data/incoming/`; only `visa_applications/` is ingested so far) with the **Process next file** button on the home page, or from the command line while the app is stopped:

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
| M2 People and places | |
| M3 Build the case | |
| M4 Safeguarding checks | |
| M5 Guests move | |
