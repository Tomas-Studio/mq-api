# ADR-0014: One Person identity with scoped memberships

Status: Accepted · 2026-11-23

## Context

Legacy has five principal types, five session tables, four login-token tables,
two SSO link tables, and a half-built merge key (`users.linked_learner_id`).

## Decision

- `identity.people`: one row per human, unique email.
- `identity.credentials`: password, passkey, email code, SSO link.
- `identity.sessions`: one table for all clients (ADR-0015).
- Capabilities come from memberships: `access.platform_roles`,
  `access.org_memberships` (owner, billing, member), `access.programme_roles`
  (learner, lead, instructor, assistant, viewer, sponsor, reviewer),
  `assessment.invitations`.
- External candidates are people with only an invitation: email + access code,
  no password, deleted with the campaign under a retention policy.
- API clients are non-human principals in `integration.api_clients`.

## Consequences

- Staff who are also learners have one account.
- Overseers become sponsors/reviewers on programmes.
- The ETL merges legacy users and learners via `linked_learner_id` and email,
  with a conflict report reviewed before each switch.

## Alternatives considered

- Candidates kept as separate campaign records: two identity paths in assessment.
- Separate principals per kind: duplicated accounts and checks.
