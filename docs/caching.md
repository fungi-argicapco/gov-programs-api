# HTTP caching and conditional requests

The public preview API uses HTTP caching for high traffic, read-heavy endpoints such as
`/v1/programs`, `/v1/programs/:id`, `/v1/sources`, and `/v1/stats/coverage`. Responses from
these routes include an `ETag` header and shared cache directives to support conditional
requests and Cloudflare's edge cache.

## Cache headers

Each cached response includes:

- `ETag`: a strong validator derived from the response payload and upstream change signals.
- `Cache-Control: public, max-age=60, s-maxage=300`: allows browsers to reuse the response for
  60 seconds and permits the Cloudflare cache to keep the representation for up to 5 minutes.
- `X-Cache`: reports whether the request was served from cache (`HIT`) or required a fresh
  computation (`MISS`).

When the request includes `If-None-Match` matching the current `ETag`, the API returns `304 Not Modified`
with the same cache headers, allowing clients to reuse their previously cached body without
re-downloading the payload.

## Example: programs listing

```bash
# First request fetches a fresh representation.
curl -i "https://api.example.com/v1/programs?q=clean+energy" | tee /tmp/programs.txt

# Extract the ETag and perform a conditional request.
ETAG=$(grep -Fi "ETag:" /tmp/programs.txt | awk '{print $2}')
curl -i -H "If-None-Match: $ETAG" "https://api.example.com/v1/programs?q=clean+energy"
```

The second request will return `304 Not Modified` when the response is unchanged. Dropping the
`If-None-Match` header after the initial fetch allows the Cloudflare cache to serve a `200 OK`
with `X-Cache: HIT` for the cached entry.

## Example: program detail

```bash
# Fetch program detail and reuse the ETag for the follow-up request.
curl -i "https://api.example.com/v1/programs/abc123" | tee /tmp/program-detail.txt
ETAG=$(grep -Fi "ETag:" /tmp/program-detail.txt | awk '{print $2}')
curl -i -H "If-None-Match: $ETAG" "https://api.example.com/v1/programs/abc123"
```

If the underlying program has not changed, the second call returns `304 Not Modified`, reducing
both bandwidth and compute costs.
