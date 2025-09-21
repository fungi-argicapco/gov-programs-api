import type { Env } from './types.js';
import { DataIngestor } from './ingest.js';

export default {
  // Scheduled trigger (cron job)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled ingestion triggered:', event.cron);
    
    try {
      const ingestor = new DataIngestor(env);
      await ingestor.initialize();
      
      const summary = await ingestor.runIngestion();
      
      // Clean up expired programs
      const cleanedUp = await ingestor.cleanupExpiredPrograms();
      
      console.log('Ingestion completed successfully:', {
        ...summary,
        expiredProgramsCleaned: cleanedUp,
      });
      
      // In a production environment, you might want to:
      // - Send notifications about the ingestion results
      // - Store ingestion logs in a separate table
      // - Update monitoring metrics
      
    } catch (error) {
      console.error('Scheduled ingestion failed:', error);
      
      // In a production environment, you might want to:
      // - Send error notifications
      // - Store error logs
      // - Update monitoring metrics
      throw error;
    }
  },

  // HTTP fetch handler for manual triggers or health checks
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({
        success: true,
        message: 'Government Programs Data Ingestor',
        version: '0.1.0',
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Manual ingestion trigger
    if (url.pathname === '/ingest' && request.method === 'POST') {
      try {
        const ingestor = new DataIngestor(env);
        await ingestor.initialize();
        
        const summary = await ingestor.runIngestion();
        const cleanedUp = await ingestor.cleanupExpiredPrograms();
        
        return Response.json({
          success: true,
          message: 'Manual ingestion completed successfully',
          data: {
            ...summary,
            expiredProgramsCleaned: cleanedUp,
          },
        });
      } catch (error) {
        console.error('Manual ingestion failed:', error);
        
        return Response.json(
          {
            success: false,
            error: 'Ingestion Failed',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          },
          500
        );
      }
    }
    
    // 404 for other paths
    return Response.json(
      {
        success: false,
        error: 'Not Found',
        message: 'The requested resource was not found',
      },
      404
    );
  },
};