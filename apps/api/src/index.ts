import { Hono } from 'hono';
import { cors, database, errorHandler, logger } from './middleware.js';
import { initializeDatabase } from '@gov-programs/db';
import type { Env } from './types.js';
import programsRoutes from './routes/programs.js';
import statsRoutes from './routes/stats.js';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger);
app.use('*', cors);
app.use('*', errorHandler);
app.use('*', database);

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    success: true,
    message: 'Government Programs API',
    version: '0.1.0',
    environment: c.env.ENVIRONMENT,
  });
});

// API routes
app.route('/api/v1/programs', programsRoutes);
app.route('/api/v1/stats', statsRoutes);

// Handle 404
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not Found',
      message: 'The requested resource was not found',
    },
    404
  );
});

// Initialize database on first request
let dbInitialized = false;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Initialize database tables and FTS5 on first request
    if (!dbInitialized) {
      try {
        const db = (await import('@gov-programs/db')).createDatabase(env.DB);
        await initializeDatabase(db);
        dbInitialized = true;
        console.log('Database initialized successfully');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        // Continue anyway - let the app handle the error
      }
    }

    return app.fetch(request, env, ctx);
  },
};