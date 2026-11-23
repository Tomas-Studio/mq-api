# ADR-0021: Real-time over one typed SSE stream with LISTEN/NOTIFY

Status: Accepted · 2026-11-23

## Context

Legacy has 16 SSE endpoints fanned out through Redis pub/sub. Mobile adds push
notifications. HttpApi supports SSE endpoints in the contract; `@effect/sql-pg`
supports `listen` and `notify`.

## Decision

- One multiplexed `GET /realtime?topics=…` SSE stream per client session, declared
  in the contract; each topic subscription is authorised by Policy.
- Writes go through normal endpoints, then `NOTIFY` carries `<topic>|<id>` (IDs
  only; 8 KB payload limit). Each server instance holds one direct connection that
  `LISTEN`s and pushes to its subscribers.
- AI token streaming stays a dedicated SSE response.
- `notifications.dispatch` routes by preference to in-app (the stream), Expo push,
  Web Push and email digest.
- Redis is retired.

## Consequences

- No extra infrastructure for real-time.
- Rate limiting moves to Front Door WAF plus a Postgres-backed limiter.
- Spikes S1 (SSE through Front Door) and S5 (LISTEN reconnects) verify the path.

## Alternatives considered

- `effect/rpc` over WebSocket: second contract style; harder on mobile networks.
- Azure Web PubSub: new paid infrastructure, separate auth handshake.
