const NS = 'LOOKUPS_KV';
type Env = { [NS]: KVNamespace };
export default async function seed(env: Env) {
  const naics = await (await fetch(new URL('../data/lookups/naics.sample.json', import.meta.url))).json();
  const xwalk = await (await fetch(new URL('../data/lookups/crosswalk.naics_sic.sample.json', import.meta.url))).json();
  await env[NS].put('naics:v1', JSON.stringify(naics));
  await env[NS].put('xwalk:naics_sic:v1', JSON.stringify(xwalk));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}
