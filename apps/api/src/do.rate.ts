export class RateLimiter {
  constructor(_state: DurableObjectState) {}

  async fetch(_request: Request): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}
