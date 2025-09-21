import { createDatabase, createProgramQueries, initializeDatabase } from '@gov-programs/db';
import { createProgramDefaults, getCurrentTimestamp } from '@gov-programs/common';
import type { Env, DataSource, IngestionResult, IngestionSummary } from './types.js';
import { DATA_SOURCES, MOCK_PROGRAMS } from './sources.js';

export class DataIngestor {
  private db;
  private queries;

  constructor(private env: Env) {
    this.db = createDatabase(env.DB);
    this.queries = createProgramQueries(this.db);
  }

  async initialize(): Promise<void> {
    await initializeDatabase(this.db);
  }

  /**
   * Run the complete data ingestion process
   */
  async runIngestion(): Promise<IngestionSummary> {
    console.log('Starting data ingestion process...');
    const startTime = Date.now();
    
    const summary: IngestionSummary = {
      timestamp: getCurrentTimestamp(),
      totalSources: 0,
      successfulSources: 0,
      failedSources: 0,
      totalProgramsProcessed: 0,
      totalProgramsCreated: 0,
      totalProgramsUpdated: 0,
      results: [],
      errors: [],
    };

    // Get enabled data sources
    const enabledSources = DATA_SOURCES.filter(source => source.enabled);
    summary.totalSources = enabledSources.length;

    // Process each data source
    for (const source of enabledSources) {
      try {
        console.log(`Processing source: ${source.name}`);
        const result = await this.ingestFromSource(source);
        summary.results.push(result);
        summary.successfulSources++;
        summary.totalProgramsProcessed += result.programsProcessed;
        summary.totalProgramsCreated += result.programsCreated;
        summary.totalProgramsUpdated += result.programsUpdated;
        console.log(`Completed source: ${source.name} - ${result.programsProcessed} programs processed`);
      } catch (error) {
        console.error(`Failed to process source ${source.name}:`, error);
        summary.failedSources++;
        summary.errors.push(`${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // For demonstration, also ingest mock data
    try {
      console.log('Processing mock data...');
      const mockResult = await this.ingestMockData();
      summary.results.push(mockResult);
      summary.successfulSources++;
      summary.totalProgramsProcessed += mockResult.programsProcessed;
      summary.totalProgramsCreated += mockResult.programsCreated;
      summary.totalProgramsUpdated += mockResult.programsUpdated;
    } catch (error) {
      console.error('Failed to process mock data:', error);
      summary.failedSources++;
      summary.errors.push(`Mock Data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const duration = Date.now() - startTime;
    console.log(`Ingestion completed in ${duration}ms`);
    console.log(`Summary: ${summary.totalProgramsProcessed} programs processed, ${summary.totalProgramsCreated} created, ${summary.totalProgramsUpdated} updated`);

    return summary;
  }

  /**
   * Ingest data from a specific external source
   */
  private async ingestFromSource(source: DataSource): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      source: source.name,
      programsProcessed: 0,
      programsCreated: 0,
      programsUpdated: 0,
      errors: [],
      duration: 0,
    };

    try {
      // In a real implementation, this would fetch data from the external API
      // For now, we'll simulate with mock data
      console.log(`Fetching data from ${source.url}...`);
      
      // Simulate API call with timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // For demonstration, we'll use a subset of mock data
      const programs = MOCK_PROGRAMS.slice(0, 2); // Simulate limited data from each source
      
      for (const programData of programs) {
        try {
          const existingProgram = await this.findExistingProgram(programData.title, source.name);
          
          if (existingProgram) {
            // Update existing program
            await this.queries.updateProgram(existingProgram.id, {
              ...programData,
              industries: JSON.stringify(programData.industries),
              tags: JSON.stringify(programData.tags),
              updatedAt: getCurrentTimestamp(),
            });
            result.programsUpdated++;
          } else {
            // Create new program
            const newProgram = {
              ...programData,
              ...createProgramDefaults(),
              industries: JSON.stringify(programData.industries),
              tags: JSON.stringify([...programData.tags, source.name.toLowerCase()]),
            };
            
            await this.queries.createProgram(newProgram);
            result.programsCreated++;
          }
          
          result.programsProcessed++;
        } catch (error) {
          console.error(`Error processing program ${programData.title}:`, error);
          result.errors.push(`${programData.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error(`Error fetching from source ${source.name}:`, error);
      result.errors.push(`Fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Ingest mock data for demonstration
   */
  private async ingestMockData(): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      source: 'Mock Data',
      programsProcessed: 0,
      programsCreated: 0,
      programsUpdated: 0,
      errors: [],
      duration: 0,
    };

    for (const programData of MOCK_PROGRAMS) {
      try {
        const existingProgram = await this.findExistingProgram(programData.title, 'Mock Data');
        
        if (existingProgram) {
          // Update existing program
          await this.queries.updateProgram(existingProgram.id, {
            ...programData,
            industries: JSON.stringify(programData.industries),
            tags: JSON.stringify(programData.tags),
            updatedAt: getCurrentTimestamp(),
            lastVerified: getCurrentTimestamp(),
          });
          result.programsUpdated++;
        } else {
          // Create new program
          const newProgram = {
            ...programData,
            ...createProgramDefaults(),
            industries: JSON.stringify(programData.industries),
            tags: JSON.stringify(programData.tags),
            lastVerified: getCurrentTimestamp(),
          };
          
          await this.queries.createProgram(newProgram);
          result.programsCreated++;
        }
        
        result.programsProcessed++;
      } catch (error) {
        console.error(`Error processing mock program ${programData.title}:`, error);
        result.errors.push(`${programData.title}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Find existing program by title and source
   */
  private async findExistingProgram(title: string, source: string): Promise<any> {
    // In a real implementation, you might use a more sophisticated matching algorithm
    // For now, we'll do a simple title-based search
    const searchResult = await this.queries.searchPrograms({
      query: title,
      limit: 1,
      offset: 0,
    });

    return searchResult.programs.length > 0 ? searchResult.programs[0] : null;
  }

  /**
   * Clean up expired programs
   */
  async cleanupExpiredPrograms(): Promise<number> {
    console.log('Cleaning up expired programs...');
    
    // This would normally run a query to find and update expired programs
    // For now, we'll just log the action
    console.log('Expired programs cleanup completed');
    
    return 0; // Number of programs cleaned up
  }
}