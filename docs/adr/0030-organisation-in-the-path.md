# ADR-0030: The current organisation comes from the path

Status: Proposed · 2026-11-24

## Context

Every tenant-scoped request needs a current organisation (ADR-0012), and the
request pipeline resolves it before the Policy middleware runs (architecture
§5.1). One person can belong to several organisations: staff in one academy,
a learner in another. The web app runs on `app.mequest…` and on client custom
domains; the mobile app has no domain of its own.

## Decision

- Organisation-scoped endpoints live under `/api/organisations/:organisationId/…`.
  The path carries the organisation id, not the slug: slugs can change, ids
  cannot.
- The `OrganisationScope` middleware runs after `Authentication`. It decodes
  `organisationId`, checks that the person is a member, and provides
  `CurrentOrganisation`. A member has an organisation membership or a role in
  one of the organisation's programmes. The check runs inside that
  organisation's RLS scope.
- A malformed id, an unknown organisation and an organisation the person does
  not belong to all answer 404 `OrganisationNotFound`, so the answer does not
  reveal which organisations exist.
- Clients find a person's organisations with `GET /api/me/organisations` and
  keep the chosen id. A custom domain will resolve to the same id
  (organisations context, later); the path stays the same.
- A contract test asserts that an endpoint uses `OrganisationScope` exactly
  when its path starts with `/api/organisations/:organisationId`.

## Consequences

- Each organisation-scoped request runs one membership query before the
  handler. It can share the per-instance cache planned for sessions.
- The Policy middleware (ADR-0016) reads `CurrentOrganisation` and adds its
  gates after this check.
- Links, logs and traces show which organisation a request was for.
- Removing a membership takes effect on the person's next request.

## Alternatives considered

- An `X-MeQuest-Organisation` header: invisible in URLs and logs, and every
  client has to remember to send it on every call.
- The domain alone: does not work on `app.mequest…` or from the mobile app.
- The slug in the path: renaming an organisation would break stored links and
  client state.
