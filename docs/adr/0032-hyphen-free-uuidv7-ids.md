# ADR-0032: Ids are UUIDv7, written without hyphens

Status: Proposed · 2026-11-27

## Context

Ids appear in URLs, API payloads and client storage
(`/api/organisations/872006ea-d545-4042-9aa3-73a40f761371`). The product owner
does not want hyphens or underscores in them. The tables so far use random
version-4 UUIDs (`gen_random_uuid()`), as do all legacy tables, which the ETL
carries over (ADR-0007).

Random UUIDs insert at random points in a primary-key index. UUIDv7 puts a
millisecond timestamp first, so new rows land at the end of the index and ids
sort by creation. Postgres 18 generates them with `uuidv7()`.

The hyphens are part of how a UUID is printed, not of the value: Postgres
stores 16 bytes and accepts the 32 hex digits without hyphens as input.

## Decision

- Primary keys stay `uuid`. New rows get `DEFAULT uuidv7()`; migration 0007
  moves the existing tables over. Rows that already exist, and legacy ids
  brought in by the ETL, keep their values.
- On the wire and in TypeScript an id is 32 lowercase hex digits with no
  hyphens, for example `01a21eb07e777271bc870800d080dd59`. The contract's id
  schemas accept only that form, so a hyphenated or upper-case id in a path
  is malformed (404 under ADR-0030).
- Every `PgClient` the API creates uses `idTypes` from `@mequest/db`, a codec
  registry that reads `uuid` columns in that form. SQL parameters need no
  conversion: strings are sent untyped and Postgres parses them.
- Neon projects and local databases run Postgres 18 or later.

## Consequences

- Ids are 32 characters, with no separators, and are not case-sensitive in
  Postgres.
- pgAdmin and `psql` still print `uuid` values with hyphens. Pasting the
  hyphen-free form into a query matches the same row.
- SQL that casts an id to text (`id::text`) gets the hyphenated form; code
  reads ids as `uuid` columns, so the codec handles them.
- New tables use `id uuid PRIMARY KEY DEFAULT uuidv7()`.
- UUIDv7 reveals the creation time of the row to anyone holding the id.
  Nothing in MEQuest treats creation time as secret.

## Alternatives considered

- **Random UUIDs, hyphenated (status quo).** Rejected: the hyphens are the
  objection, and random keys scatter inserts across the index.
- **22-character base62 or 26-character ULID strings stored as `text`.**
  Shorter, but give up the native type, its 16-byte storage and Postgres's
  format check, need a custom generator, and (base62) are case-sensitive.
- **Short ids in the API over `uuid` storage.** pgAdmin would show a different
  id from the API, so every lookup would need a conversion.
- **Integer ids.** Guessable, reveal counts, only the database can create them
  (no offline creation on mobile), and legacy rows would need id mapping.
- **Random nanoids.** Not time-ordered, stored as `text`, and legacy rows
  would need id mapping tables in the ETL.
