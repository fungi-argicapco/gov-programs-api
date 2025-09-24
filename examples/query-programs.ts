const API_BASE = process.env.API_BASE ?? 'http://localhost:8787';

async function main() {
  const url = new URL('/v1/programs', API_BASE);
  url.searchParams.set('q', 'clean energy');

  const firstResponse = await fetch(url);
  console.log('GET', url.toString(), '->', firstResponse.status, firstResponse.headers.get('x-cache'));
  const etag = firstResponse.headers.get('etag');
  if (etag) {
    console.log('ETag:', etag);
  }
  const payload = await firstResponse.json();
  console.log('Received', Array.isArray(payload.data) ? payload.data.length : 0, 'programs');

  if (!etag) {
    return;
  }

  const secondResponse = await fetch(url, {
    headers: {
      'If-None-Match': etag,
    },
  });
  console.log('Conditional GET ->', secondResponse.status, secondResponse.headers.get('x-cache'));
  if (secondResponse.status === 304) {
    console.log('Cache is fresh; reuse the prior response body.');
  } else {
    const refreshed = await secondResponse.json();
    console.log('Updated result count:', Array.isArray(refreshed.data) ? refreshed.data.length : 0);
  }
}

await main().catch((error) => {
  console.error('Failed to query programs:', error);
  process.exit(1);
});
