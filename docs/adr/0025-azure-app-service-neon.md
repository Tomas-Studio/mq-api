# ADR-0025: Azure App Service + Front Door + Neon, defined in Bicep

Status: Accepted · 2026-11-23

## Context

Legacy runs on three hand-provisioned Azure App Services with Postgres Flexible
Server and no infrastructure-as-code. Dedicated instances (e.g. ReinMaths) need
to be repeatable. Render was evaluated: it lacked object storage and a WAF, and
first-party `/api` on custom domains needed unverified rewrites.

## Decision

- Compute: Azure App Service (Linux, Node 24 LTS): `app-mqapi-server` with
  scale-out rules and `app-mqapi-worker` (Always On, one instance).
- Edge: Azure Front Door with WAF; `/api/*` → server on every web domain,
  including client custom domains with managed TLS.
- Database: **Neon** (Azure Native ISV service), one project per deployment, in
  Germany West Central with App Service.
  - Pooled endpoint for server queries; direct connections for `LISTEN`, the
    worker, migrations and the ETL (Neon's pooler is PgBouncer in transaction
    mode: no LISTEN/NOTIFY, no session advisory locks, no session `SET`).
  - Production compute always on; preview branches scale to zero.
  - Branches for `legacy-mirror`, `etl-rehearsal`, `pr-<n>` previews and
    `pre-switch-<date>` restore points.
  - Network: App Service VNet integration → NAT gateway (static egress IP) →
    Neon public endpoint, TLS `verify-full`, IP allow-list of the NAT IP only.
- Also: Blob Storage (media, presigned uploads), Key Vault, Application Insights.
- Everything in `infra/main.bicep` with `infra/params/<deployment>.bicepparam`.

## Consequences

- A new dedicated instance is a parameter file plus a pipeline run.
- Neon documents private networking only via AWS PrivateLink; on Azure the
  database endpoint is public (hardened). A regulated client requiring private
  database connectivity gets Postgres Flexible Server in its parameter file; the
  code is unchanged because only branching tooling is Neon-specific.
- Roles must be created with SQL (ADR-0012).
- Some Neon Bicep resource types are preview API versions (spike S7).

## Alternatives considered

- Azure Postgres Flexible Server everywhere: private networking, but no branching.
- Azure Container Apps: finer scaling; more new operational knowledge.
- AKS: multi-runner cluster headroom not needed yet.
- Render: see Context.
