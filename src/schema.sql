-- Share rebuild schema. Two layers:
--   raw   = files exactly as received, plus what we could not use
--   serve = the tables the web app reads
-- Every statement is idempotent so the app can run this on every boot.
-- No foreign key constraints on purpose: DuckDB updates on constrained tables
-- are fragile, and the app owns referential integrity through the ingest code.

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS serve;

-- ---------------------------------------------------------------- raw

CREATE TABLE IF NOT EXISTS raw.ingested_files (
  file_name       VARCHAR PRIMARY KEY,
  file_type       VARCHAR NOT NULL,          -- applications | arrivals | eoi
  processed_at    TIMESTAMP NOT NULL,
  row_count       INTEGER NOT NULL,
  created_count   INTEGER NOT NULL,
  skipped_count   INTEGER NOT NULL,
  rejected_count  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS raw.rejected_rows (
  file_name   VARCHAR NOT NULL,
  row_number  INTEGER NOT NULL,
  reason      VARCHAR NOT NULL,
  raw_text    VARCHAR
);

CREATE TABLE IF NOT EXISTS raw.submissions (
  submission_guid VARCHAR PRIMARY KEY,
  file_name       VARCHAR NOT NULL,
  payload         JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS raw.arrival_rows (
  row_hash          VARCHAR PRIMARY KEY,
  file_name         VARCHAR NOT NULL,
  webvaf            VARCHAR,
  uan               VARCHAR,
  decision_date     VARCHAR,
  decision          VARCHAR,
  voy_code          VARCHAR,
  voy_arr_port      VARCHAR,
  voy_arr_datetime  VARCHAR,
  person_identifier VARCHAR
);

-- ---------------------------------------------------------------- serve

CREATE SEQUENCE IF NOT EXISTS serve.seq_sponsors;
CREATE SEQUENCE IF NOT EXISTS serve.seq_accommodations;
CREATE SEQUENCE IF NOT EXISTS serve.seq_cases;
CREATE SEQUENCE IF NOT EXISTS serve.seq_applications;
CREATE SEQUENCE IF NOT EXISTS serve.seq_guests;
CREATE SEQUENCE IF NOT EXISTS serve.seq_checks;
CREATE SEQUENCE IF NOT EXISTS serve.seq_case_events;

CREATE TABLE IF NOT EXISTS serve.sponsors (
  id            INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_sponsors'),
  dedupe_key    VARCHAR UNIQUE NOT NULL,   -- lower(given|family|postcode)
  given_name    VARCHAR,
  family_name   VARCHAR,
  date_of_birth VARCHAR,
  email         VARCHAR,
  telephone     VARCHAR,
  address       VARCHAR,
  postcode      VARCHAR,
  council       VARCHAR
);

CREATE TABLE IF NOT EXISTS serve.accommodations (
  id          INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_accommodations'),
  dedupe_key  VARCHAR UNIQUE NOT NULL,     -- lower(address|postcode)
  address     VARCHAR,
  postcode    VARCHAR,
  council     VARCHAR                      -- nullable: some applications name no council (M8)
);

CREATE TABLE IF NOT EXISTS serve.cases (
  id               INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_cases'),
  dedupe_key       VARCHAR UNIQUE NOT NULL, -- sponsor_id|accommodation_id
  sponsor_id       INTEGER NOT NULL,
  accommodation_id INTEGER,                -- null until an address is known
  council          VARCHAR,
  title            VARCHAR NOT NULL,
  checks_status    VARCHAR NOT NULL DEFAULT 'Checks Required',
  created_at       TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS serve.applications (
  id                    INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_applications'),
  submission_guid       VARCHAR UNIQUE NOT NULL,
  uan                   VARCHAR,
  gwf                   VARCHAR,
  event_datetime        TIMESTAMP,
  source_file           VARCHAR NOT NULL,
  sponsor_id            INTEGER,
  accommodation_id      INTEGER,
  case_id               INTEGER,
  host_given_name       VARCHAR,
  host_family_name      VARCHAR,
  staying_with_sponsor  VARCHAR,
  visa_status           VARCHAR NOT NULL DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS serve.guests (
  id              INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_guests'),
  application_id  INTEGER NOT NULL,
  person_id       INTEGER NOT NULL,
  is_lead         BOOLEAN NOT NULL,
  given_name      VARCHAR,
  family_name     VARCHAR,
  date_of_birth   DATE,
  sex             VARCHAR,
  nationality     VARCHAR,
  passport_number VARCHAR,
  relationship    VARCHAR,
  arrived_at      TIMESTAMP
);

CREATE TABLE IF NOT EXISTS serve.application_updates (
  row_hash          VARCHAR PRIMARY KEY,
  application_id    INTEGER NOT NULL,
  decision          VARCHAR,
  decision_date     DATE,
  arrival_datetime  TIMESTAMP,
  source_file       VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS serve.checks (
  id                     INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_checks'),
  case_id                INTEGER NOT NULL,
  kind                   INTEGER NOT NULL,        -- 1 exists, 2 suitable, 3 dbs, 4 arrived
  status                 VARCHAR NOT NULL DEFAULT 'Not Started',
  reason                 VARCHAR,
  requires_enhanced_dbs  BOOLEAN NOT NULL DEFAULT false,
  enhanced_dbs_confirmed BOOLEAN NOT NULL DEFAULT false,
  updated_at             TIMESTAMP
);

CREATE TABLE IF NOT EXISTS serve.case_events (
  id           INTEGER PRIMARY KEY DEFAULT nextval('serve.seq_case_events'),
  case_id      INTEGER NOT NULL,
  occurred_at  TIMESTAMP NOT NULL,
  kind         VARCHAR NOT NULL,
  description  VARCHAR NOT NULL
);

-- Migrations for databases created before a column changed. Safe to re-run.
ALTER TABLE serve.cases ALTER COLUMN accommodation_id DROP NOT NULL;
