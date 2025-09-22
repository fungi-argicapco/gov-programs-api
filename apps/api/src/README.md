# API Module Overview

The `apps/api/src` package exposes the HTTP interface for the government programs platform. It
provides program discovery, scoring, stack recommendation, saved queries, alert management, and
administrative health endpoints. Each handler composes shared utilities for persistence, request
sanitisation, and scoring.

## Match Scoring

The `/v1/match` endpoint accepts a business profile and optional filters, returning scored program
candidates. Scoring is executed by `match.ts`, which combines jurisdiction, industry, timing, size,
and freshness dimensions into a single weighted value.

### Timing Score Algorithm

`computeTimingScore` evaluates how well a program's availability window aligns with a profile's
eligible timeline. It calculates the overlap between the two windows and compares that duration to
the shortest finite window between them. The resulting ratio is capped at `1.0`, so a program that
fully covers the shorter availability period earns full credit, while partial overlaps receive a
proportional score.

### Stack Suggestions

The `/v1/stacks/suggest` endpoint leverages the scored program list to assemble a recommended stack
subject to CAPEX and tag-based constraints. The algorithm exits early as soon as the remaining CAPEX
is exhausted, ensuring unnecessary iterations are avoided.

## Saved Queries & Alerts

Saved queries and alert subscriptions share authentication and rate-limiting middleware. They rely
on the same sanitisation helpers used by the matching endpoints to guarantee consistent validation.

## Administrative Health

Admin endpoints expose health insights such as source freshness and coverage statistics. These
endpoints are authenticated and rate-limited to align with operational access requirements.
