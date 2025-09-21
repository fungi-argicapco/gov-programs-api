# API Documentation

The Government Programs API provides RESTful endpoints to search, retrieve, and manage government funding, credit, rebate, and incentive programs.

## Base URL

```
https://your-worker.your-subdomain.workers.dev
```

## Authentication

Currently, the API does not require authentication. Future versions may include API key authentication.

## Response Format

All API responses follow this format:

```json
{
  "success": boolean,
  "data": object | array,
  "error": string,
  "message": string
}
```

## Error Handling

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

Error Response:
```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Invalid program data"
}
```

## Endpoints

### Health Check

#### GET /

Check API health and version.

**Response:**
```json
{
  "success": true,
  "message": "Government Programs API",
  "version": "0.1.0",
  "environment": "production"
}
```

### Programs

#### GET /api/v1/programs

Search programs with optional filters.

**Query Parameters:**
- `q` or `query` (string) - Full-text search query
- `type` (string) - Program type: `funding`, `credit`, `rebate`, `incentive`
- `geography` (string) - Geography level: `local`, `regional`, `state`, `federal`
- `state` (string) - US state code (2 letters, e.g., `CA`, `NY`)
- `city` (string) - City name
- `industries` (string) - Comma-separated industry categories
- `status` (string) - Program status: `active`, `inactive`, `pending`, `expired`
- `startDate` (string) - Filter by program start date (ISO 8601)
- `endDate` (string) - Filter by program end date (ISO 8601)
- `limit` (integer) - Results per page (1-100, default: 20)
- `offset` (integer) - Results offset (default: 0)

**Example:**
```bash
GET /api/v1/programs?q=solar&industries=renewable_energy&state=CA&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "title": "California Solar Initiative",
        "description": "State program providing rebates for solar energy systems",
        "type": "rebate",
        "status": "active",
        "geographyLevel": "state",
        "state": "CA",
        "industries": "[\"renewable_energy\", \"construction\"]",
        "eligibilityRequirements": "Property owners in California...",
        "benefitAmount": "Up to $3,000 per residential system",
        "websiteUrl": "https://example.com",
        "tags": "[\"solar\", \"renewable energy\"]",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "total": 25,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

#### GET /api/v1/programs/:id

Get a specific program by ID.

**Parameters:**
- `id` (string) - Program UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "title": "Small Business Innovation Research",
    // ... full program object
  }
}
```

#### POST /api/v1/programs

Create a new program.

**Request Body:**
```json
{
  "title": "New Program",
  "description": "Program description",
  "type": "funding",
  "status": "active",
  "geographyLevel": "federal",
  "industries": ["technology", "healthcare"],
  "eligibilityRequirements": "Requirements...",
  "benefitAmount": "$50,000 max",
  "websiteUrl": "https://example.com",
  "tags": ["innovation", "grants"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "title": "New Program",
    // ... full program object with generated fields
  },
  "message": "Program created successfully"
}
```

#### PUT /api/v1/programs/:id

Update an existing program.

**Parameters:**
- `id` (string) - Program UUID

**Request Body:** (partial program object)
```json
{
  "status": "inactive",
  "benefitAmount": "$75,000 max"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    // ... updated program object
  },
  "message": "Program updated successfully"
}
```

#### DELETE /api/v1/programs/:id

Delete a program.

**Parameters:**
- `id` (string) - Program UUID

**Response:**
```json
{
  "success": true,
  "message": "Program deleted successfully"
}
```

### Specialized Program Endpoints

#### GET /api/v1/programs/geography/:level

Get programs by geography level.

**Parameters:**
- `level` (string) - Geography level: `local`, `regional`, `state`, `federal`

**Query Parameters:**
- `state` (string) - Filter by state
- `city` (string) - Filter by city
- `limit` (integer) - Results per page
- `offset` (integer) - Results offset

#### GET /api/v1/programs/industry/:industry

Get programs by industry category.

**Parameters:**
- `industry` (string) - Industry category

#### GET /api/v1/programs/active

Get all active programs.

#### GET /api/v1/programs/expiring-soon

Get programs expiring within 30 days.

### Statistics

#### GET /api/v1/stats

Get program statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "active": 120,
    "byType": {
      "funding": 60,
      "credit": 30,
      "rebate": 40,
      "incentive": 20
    },
    "byGeography": {
      "federal": 25,
      "state": 75,
      "regional": 30,
      "local": 20
    }
  }
}
```

## Data Models

### Program Object

```typescript
{
  id: string;                    // UUID
  title: string;                 // Program title
  description: string;           // Detailed description
  type: 'funding' | 'credit' | 'rebate' | 'incentive';
  status: 'active' | 'inactive' | 'pending' | 'expired';
  geographyLevel: 'local' | 'regional' | 'state' | 'federal';
  state?: string;                // US state code (2 letters)
  city?: string;                 // City name
  county?: string;               // County name
  region?: string;               // Regional designation
  industries: string;            // JSON array of industry categories
  eligibilityRequirements: string;
  benefitAmount?: string;        // Flexible benefit description
  applicationDeadline?: string;  // ISO 8601 datetime
  programStartDate?: string;     // ISO 8601 datetime
  programEndDate?: string;       // ISO 8601 datetime
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  applicationUrl?: string;
  tags: string;                  // JSON array of tags
  createdAt: string;             // ISO 8601 datetime
  updatedAt: string;             // ISO 8601 datetime
  lastVerified?: string;         // ISO 8601 datetime
}
```

### Industry Categories

- `agriculture`
- `automotive`
- `construction`
- `education`
- `energy`
- `healthcare`
- `manufacturing`
- `nonprofit`
- `small_business`
- `technology`
- `transportation`
- `renewable_energy`
- `other`

## Usage Examples

### Search for Small Business Funding

```bash
curl "https://your-api.workers.dev/api/v1/programs?type=funding&industries=small_business&status=active"
```

### Find State-Level Renewable Energy Programs

```bash
curl "https://your-api.workers.dev/api/v1/programs?geography=state&industries=renewable_energy"
```

### Search with Full-Text Query

```bash
curl "https://your-api.workers.dev/api/v1/programs?q=solar%20panel%20installation"
```

### Get Programs in California

```bash
curl "https://your-api.workers.dev/api/v1/programs?state=CA&limit=50"
```

### Create a New Program

```bash
curl -X POST "https://your-api.workers.dev/api/v1/programs" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Green Building Incentive",
    "description": "Incentive program for sustainable construction",
    "type": "incentive",
    "status": "active",
    "geographyLevel": "state",
    "state": "NY",
    "industries": ["construction", "energy"],
    "eligibilityRequirements": "LEED certified buildings",
    "benefitAmount": "Up to $10,000 tax credit"
  }'
```

## Rate Limits

Currently no rate limits are enforced. In production, consider implementing:
- Per-IP rate limiting via Cloudflare
- API key-based quotas
- Request throttling for bulk operations

## SDKs and Libraries

### JavaScript/TypeScript

```typescript
// Using fetch API
const response = await fetch('https://your-api.workers.dev/api/v1/programs?q=solar');
const data = await response.json();

// Using the common package types
import type { GovernmentProgram, SearchQuery } from '@gov-programs/common';
```

## Versioning

The API uses path-based versioning (`/api/v1/`). Future versions will maintain backward compatibility when possible.

## Support

- File issues on [GitHub](https://github.com/fungi-argicapco/gov-programs-api/issues)
- Check [API status page](https://status.your-domain.com) for service status
- Review [deployment guide](deployment.md) for setup instructions