# Homes for Ukraine casework (Team One)

A hackathon rebuild of Share, the casework service for the Homes for Ukraine scheme. All data is synthetic.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000.

Process the next data file (they go in number order, `data/incoming/01` to `20`):

```
npm run ingest
```

Inspect the database:

```
duckdb data/share.duckdb -readonly
```

## Stack

Node 24, Express 5, Nunjucks with the official GOV.UK Frontend macros, DuckDB as the single-file database.

## Milestone log

| Milestone | Status |
|---|---|
| M0 Setup | done |
| M1 Applications arrive | |
| M2 People and places | |
| M3 Build the case | |
| M4 Safeguarding checks | |
| M5 Guests move | |
