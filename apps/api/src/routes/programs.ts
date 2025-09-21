import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import type { Env, PaginatedResponse, ApiResponse } from '../types.js';
import type { Program } from '@gov-programs/db';
import {
  SearchQuery,
  GovernmentProgram,
  parseSearchParams,
  createProgramDefaults,
} from '@gov-programs/common';

const app = new Hono<{ Bindings: Env; Variables: { queries: any } }>();

// GET /programs - Search programs
app.get('/', async (c) => {
  const queries = c.get('queries');
  const url = new URL(c.req.url);
  const searchParams = parseSearchParams(url.searchParams);
  
  try {
    const validatedQuery = SearchQuery.parse(searchParams);
    const result = await queries.searchPrograms(validatedQuery);
    
    const response: PaginatedResponse<Program> = {
      data: result.programs,
      total: result.total,
      limit: validatedQuery.limit,
      offset: validatedQuery.offset,
      hasMore: result.total > validatedQuery.offset + validatedQuery.limit,
    };
    
    return c.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Search error:', error);
    throw new HTTPException(400, { message: 'Invalid search parameters' });
  }
});

// GET /programs/:id - Get program by ID
app.get('/:id', async (c) => {
  const queries = c.get('queries');
  const id = c.req.param('id');
  
  if (!id) {
    throw new HTTPException(400, { message: 'Program ID is required' });
  }
  
  try {
    const program = await queries.getProgramById(id);
    
    if (!program) {
      throw new HTTPException(404, { message: 'Program not found' });
    }
    
    return c.json({
      success: true,
      data: program,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Get program error:', error);
    throw new HTTPException(500, { message: 'Failed to retrieve program' });
  }
});

// POST /programs - Create new program
app.post(
  '/',
  validator('json', (value, c) => {
    try {
      const parsed = GovernmentProgram.omit({ 
        id: true, 
        createdAt: true, 
        updatedAt: true 
      }).parse(value);
      return parsed;
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid program data' });
    }
  }),
  async (c) => {
    const queries = c.get('queries');
    const programData = c.req.valid('json');
    
    try {
      // Add generated fields
      const newProgram = {
        ...programData,
        ...createProgramDefaults(),
        industries: JSON.stringify(programData.industries),
        tags: JSON.stringify(programData.tags || []),
      };
      
      const created = await queries.createProgram(newProgram);
      
      return c.json(
        {
          success: true,
          data: created,
          message: 'Program created successfully',
        },
        201
      );
    } catch (error) {
      console.error('Create program error:', error);
      throw new HTTPException(500, { message: 'Failed to create program' });
    }
  }
);

// PUT /programs/:id - Update program
app.put(
  '/:id',
  validator('json', (value, c) => {
    try {
      const parsed = GovernmentProgram.omit({ 
        id: true, 
        createdAt: true, 
        updatedAt: true 
      }).partial().parse(value);
      return parsed;
    } catch (error) {
      throw new HTTPException(400, { message: 'Invalid program data' });
    }
  }),
  async (c) => {
    const queries = c.get('queries');
    const id = c.req.param('id');
    const programData = c.req.valid('json');
    
    if (!id) {
      throw new HTTPException(400, { message: 'Program ID is required' });
    }
    
    try {
      // Convert arrays to JSON strings for storage
      const updateData = {
        ...programData,
        ...(programData.industries && { industries: JSON.stringify(programData.industries) }),
        ...(programData.tags && { tags: JSON.stringify(programData.tags) }),
      };
      
      const updated = await queries.updateProgram(id, updateData);
      
      if (!updated) {
        throw new HTTPException(404, { message: 'Program not found' });
      }
      
      return c.json({
        success: true,
        data: updated,
        message: 'Program updated successfully',
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error('Update program error:', error);
      throw new HTTPException(500, { message: 'Failed to update program' });
    }
  }
);

// DELETE /programs/:id - Delete program
app.delete('/:id', async (c) => {
  const queries = c.get('queries');
  const id = c.req.param('id');
  
  if (!id) {
    throw new HTTPException(400, { message: 'Program ID is required' });
  }
  
  try {
    const deleted = await queries.deleteProgram(id);
    
    if (!deleted) {
      throw new HTTPException(404, { message: 'Program not found' });
    }
    
    return c.json({
      success: true,
      message: 'Program deleted successfully',
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('Delete program error:', error);
    throw new HTTPException(500, { message: 'Failed to delete program' });
  }
});

// GET /programs/geography/:level - Get programs by geography
app.get('/geography/:level', async (c) => {
  const queries = c.get('queries');
  const level = c.req.param('level');
  const state = c.req.query('state');
  const city = c.req.query('city');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  
  try {
    const programs = await queries.getProgramsByGeography(level, state, city, limit, offset);
    
    return c.json({
      success: true,
      data: programs,
    });
  } catch (error) {
    console.error('Geography search error:', error);
    throw new HTTPException(500, { message: 'Failed to search programs by geography' });
  }
});

// GET /programs/industry/:industry - Get programs by industry
app.get('/industry/:industry', async (c) => {
  const queries = c.get('queries');
  const industry = c.req.param('industry');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  
  try {
    const programs = await queries.getProgramsByIndustry(industry, limit, offset);
    
    return c.json({
      success: true,
      data: programs,
    });
  } catch (error) {
    console.error('Industry search error:', error);
    throw new HTTPException(500, { message: 'Failed to search programs by industry' });
  }
});

// GET /programs/active - Get active programs
app.get('/active', async (c) => {
  const queries = c.get('queries');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  
  try {
    const programs = await queries.getActivePrograms(limit, offset);
    
    return c.json({
      success: true,
      data: programs,
    });
  } catch (error) {
    console.error('Active programs error:', error);
    throw new HTTPException(500, { message: 'Failed to retrieve active programs' });
  }
});

// GET /programs/expiring-soon - Get programs expiring soon
app.get('/expiring-soon', async (c) => {
  const queries = c.get('queries');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  
  try {
    const programs = await queries.getProgramsExpiringSoon(limit, offset);
    
    return c.json({
      success: true,
      data: programs,
    });
  } catch (error) {
    console.error('Expiring programs error:', error);
    throw new HTTPException(500, { message: 'Failed to retrieve expiring programs' });
  }
});

export default app;