# ADR-0022: Versioned course content in Postgres, two authoring paths

Status: Accepted · 2026-11-23

## Context

Legacy content is 38 courses as 1,878 block-JSON files (~50 block types) in the
git repository, bundled into the server and synced to Blob by CI. The AI Course
Creator saves by committing to GitHub. Mobile must render the same blocks natively.

## Decision

- Runtime model: `content.courses` → `course_versions` (draft/published,
  immutable once published, content hash) → `units` → `blocks` (JSONB).
- Blocks are a `Schema.Union` in `@mequest/contract`; web and mobile render the same typed set.
- Ownership per organisation: the MEQuest library belongs to a MEQuest
  organisation and is licensed per learner for 12 months; custom courses belong to the client.
- Authoring: MEQuest library stays JSON in git with PR review, and CI publishes a
  new version through the API. Client, custom and AI-generated courses are drafts
  authored in-app through the API.
- Mobile downloads a published version as one bundle; ETag = content hash.

## Consequences

- No git commits or redeploys to publish client content.
- A new block type is a contract change (ADR-0017).
- Learners are pinned to a version; moving them to a newer one is an explicit policy.

## Alternatives considered

- All authoring in-app: requires a full block editor before cutover.
- Files in git/Blob served by the API: no database view, licensing outside the schema.
