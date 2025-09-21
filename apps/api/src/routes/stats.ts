import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from '../types.js';

const app = new Hono<{ Bindings: Env; Variables: { queries: any } }>();

// GET /stats - Get program statistics
app.get('/', async (c) => {
  const queries = c.get('queries');
  
  try {
    const stats = await queries.getProgramStats();
    
    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    throw new HTTPException(500, { message: 'Failed to retrieve statistics' });
  }
});

export default app;