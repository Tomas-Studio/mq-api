# ADR-0023: Offline learning via idempotent event batches

Status: Accepted · 2026-11-23

## Context

Legacy offers offline flashcards in its PWA. Mobile learners in low-connectivity
areas need more.

## Decision

- Offline in v1: downloaded lessons, knowledge checks, flashcards, progress.
- Online-only: assessments, community, live features, payments.
- Offline writes are append-only events (`unit.viewed`, `check.answered`,
  `flashcard.reviewed`) with client-generated keys, replayed via
  `POST /learning/events:batch`. The server deduplicates and recomputes progress;
  there are no merge conflicts because nothing is edited in place.
- Every mutating endpoint accepts `Idempotency-Key`; responses are stored per key
  for a retention window.

## Consequences

- Retries on poor networks are safe everywhere, not only offline.
- Progress is derived from events, which also feeds golden-output comparison (ADR-0009).

## Alternatives considered

- Flashcards only: misses the main reason for a native app.
- Full offline-first sync engine: conflict resolution and RLS-aware sync are a large dependency.
