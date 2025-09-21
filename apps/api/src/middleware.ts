import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './types.js';
import { createDatabase, createProgramQueries } from '@gov-programs/db';

// CORS middleware
export const cors = createMiddleware(async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});

// Database middleware - adds db and queries to context
export const database = createMiddleware<{ Bindings: Env; Variables: { db: ReturnType<typeof createDatabase>; queries: ReturnType<typeof createProgramQueries> } }>(async (c, next) => {
  const db = createDatabase(c.env.DB);
  const queries = createProgramQueries(db);
  c.set('db', db);
  c.set('queries', queries);
  await next();
});

// Error handling middleware
export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof HTTPException) {
      return c.json(
        {
          success: false,
          error: 'HTTP Error',
          message: error.message,
        },
        error.status
      );
    }
    
    if (error instanceof Error) {
      return c.json(
        {
          success: false,
          error: 'Internal Server Error',
          message: error.message,
        },
        500
      );
    }
    
    return c.json(
      {
        success: false,
        error: 'Unknown Error',
        message: 'An unexpected error occurred',
      },
      500
    );
  }
});

// Request logging middleware
export const logger = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const end = Date.now();
  
  console.log(
    `${c.req.method} ${c.req.url} - ${c.res.status} - ${end - start}ms`
  );
});