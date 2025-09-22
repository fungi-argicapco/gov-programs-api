import { Hono } from 'hono';

export type Program = {
  id: string;
  name: string;
  description: string;
  url: string;
  region: string;
  industries: string[];
  tags: string[];
  criteria: string[];
};

const programs: Program[] = [
  {
    id: 'california-small-business-grant',
    name: 'California Small Business Grant',
    description:
      'Provides matching funds for capital investments made by eligible small businesses operating in California.',
    url: 'https://example.com/programs/california-small-business-grant',
    region: 'CA',
    industries: ['Manufacturing', 'Retail'],
    tags: ['grant', 'small-business'],
    criteria: ['< 100 employees', 'Revenue under $10M']
  }
];

const app = new Hono();

app.get('/v1/health', (c) =>
  c.json({
    ok: true,
    service: 'gov-programs-api'
  })
);

app.get('/v1/programs', (c) => c.json(programs));

export default app;
