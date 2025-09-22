# API service

This package hosts the HTTP surface for the worker that powers program matching,
stack suggestions, and administrative tooling.

## Matching endpoints

### `POST /v1/match`

Returns a list of scored programs for a sanitized profile. The endpoint consults
the weighting configuration returned by `loadWeights` and limits the number of
entries sent back to clients via the `DEFAULT_MATCH_RESPONSE_LIMIT` constant in
`index.ts`. The limit currently defaults to 50 results so that clients always
receive a predictable payload size. Increase the limit by updating the constant
(or by extending the handler to read from configuration) before deploying if a
larger response window is required.

### Timing score rationale

The matching engine evaluates several sub-scores, one of which is the timing
score calculated in `computeTimingScore`. The function measures the overlap of
the profile and program availability windows, computes the duration of the
intersection, and divides it by the shorter finite duration of the two windows.
Using the shortest duration as the denominator ensures that a short-lived
profile or program is not unfairly penalised when compared with an open-ended
range. Open-ended or unbounded ranges are treated as always available and earn a
perfect score whenever there is any overlap.

### `POST /v1/stacks/suggest`

Builds a stack of programs ordered by score while honouring CAPEX and mutual
exclusion constraints. The handler now checks the remaining CAPEX before doing
any expensive per-program work so the loop terminates as soon as the budget is
exhausted.
