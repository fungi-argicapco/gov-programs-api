# Government Programs API

A production-ready TypeScript monorepo providing a searchable database and API for government funding, credit, rebate, and incentive programs across local, regional, and state levels with industry and date-range filters.

## 🏗️ Architecture

This monorepo uses pnpm workspaces and consists of:

- **apps/api** - Cloudflare Worker REST API with Hono framework
- **apps/ingest** - Scheduled ETL worker for data ingestion  
- **packages/db** - Drizzle ORM for Cloudflare D1 with FTS5 search
- **packages/common** - Shared utilities, types, and validation schemas

## 🚀 Features

- **Full-text search** with SQLite FTS5 for fast program discovery
- **Multi-dimensional filtering** by geography, industry, program type, and dates
- **RESTful API** with comprehensive endpoints
- **Automated data ingestion** with scheduled ETL pipeline
- **Production-ready** with CI/CD, monitoring, and error handling
- **Type-safe** with TypeScript and Zod validation
- **Scalable** architecture using Cloudflare Workers and D1

## 📊 Data Model

Programs are categorized by:
- **Type**: funding, credit, rebate, incentive
- **Geography**: local, regional, state, federal
- **Industry**: agriculture, automotive, construction, education, energy, healthcare, manufacturing, nonprofit, small_business, technology, transportation, renewable_energy, other
- **Status**: active, inactive, pending, expired

## 🛠️ Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Cloudflare account (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/fungi-argicapco/gov-programs-api.git
cd gov-programs-api

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Local Development

```bash
# Start API development server
pnpm --filter @gov-programs/api dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm typecheck
```

## 🌐 API Endpoints

### Programs

- `GET /api/v1/programs` - Search programs with filters
- `GET /api/v1/programs/:id` - Get program by ID
- `POST /api/v1/programs` - Create new program
- `PUT /api/v1/programs/:id` - Update program
- `DELETE /api/v1/programs/:id` - Delete program
- `GET /api/v1/programs/geography/:level` - Get programs by geography
- `GET /api/v1/programs/industry/:industry` - Get programs by industry
- `GET /api/v1/programs/active` - Get active programs
- `GET /api/v1/programs/expiring-soon` - Get programs expiring soon

### Statistics

- `GET /api/v1/stats` - Get program statistics

### Search Parameters

- `q` or `query` - Full-text search query
- `type` - Program type (funding, credit, rebate, incentive)
- `geography` - Geography level (local, regional, state, federal)
- `state` - US state code (e.g., CA, NY)
- `city` - City name
- `industries` - Comma-separated industry categories
- `status` - Program status (active, inactive, pending, expired)
- `startDate` - Program start date (ISO 8601)
- `endDate` - Program end date (ISO 8601)
- `limit` - Results per page (default: 20, max: 100)
- `offset` - Results offset (default: 0)

### Example Requests

```bash
# Search for active solar energy programs in California
curl "https://your-api.workers.dev/api/v1/programs?q=solar&industries=renewable_energy&state=CA&status=active"

# Get programs expiring in the next 30 days
curl "https://your-api.workers.dev/api/v1/programs/expiring-soon"

# Get federal funding programs for small businesses
curl "https://your-api.workers.dev/api/v1/programs?type=funding&geography=federal&industries=small_business"
```

## 🔧 Deployment

### Cloudflare Setup

1. Create a Cloudflare account and get your Account ID
2. Create a D1 database:
   ```bash
   cd apps/api
   npx wrangler d1 create gov-programs-db
   ```
3. Update the `database_id` in both `wrangler.toml` files
4. Generate an API token with the following permissions:
   - Account: Zone:Read, Account Settings:Read
   - Zone Resources: Include All zones
   - Account Resources: Include All accounts

### Manual Deployment

```bash
# Deploy API
cd apps/api
npx wrangler deploy

# Deploy Ingest Worker
cd apps/ingest
npx wrangler deploy
```

### Automated Deployment

The project includes GitHub Actions workflows for automated deployment:

1. Set up repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

2. Push to `develop` branch for staging deployment
3. Push to `main` branch for production deployment

## 📦 Package Structure

```
gov-programs-api/
├── apps/
│   ├── api/                 # REST API (Cloudflare Worker)
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   ├── middleware.ts # Request middleware
│   │   │   ├── types.ts     # API-specific types
│   │   │   └── index.ts     # Worker entry point
│   │   ├── wrangler.toml    # Cloudflare configuration
│   │   └── package.json
│   └── ingest/              # ETL Worker
│       ├── src/
│       │   ├── ingest.ts    # Data ingestion logic
│       │   ├── sources.ts   # Data source configurations
│       │   ├── types.ts     # Ingest-specific types
│       │   └── index.ts     # Worker entry point
│       ├── wrangler.toml    # Cloudflare configuration
│       └── package.json
├── packages/
│   ├── common/              # Shared utilities
│   │   ├── src/
│   │   │   ├── types.ts     # Shared type definitions
│   │   │   ├── utils.ts     # Utility functions
│   │   │   └── index.ts
│   │   └── package.json
│   └── db/                  # Database layer
│       ├── src/
│       │   ├── schema.ts    # Drizzle database schema
│       │   ├── queries.ts   # Database query methods
│       │   └── index.ts
│       ├── drizzle.config.ts
│       └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml           # CI/CD pipeline
├── package.json             # Root package configuration
├── pnpm-workspace.yaml      # pnpm workspace configuration
├── tsconfig.json            # TypeScript configuration
└── README.md
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @gov-programs/common test

# Run tests in watch mode
pnpm --filter @gov-programs/common test --watch
```

## 📈 Monitoring and Logging

The API includes comprehensive logging and error handling:

- Request/response logging with timing information
- Structured error responses with appropriate HTTP status codes
- Database query performance tracking
- Ingestion pipeline monitoring with detailed success/failure reports

## 🔒 Security

- Input validation using Zod schemas
- SQL injection prevention through parameterized queries
- CORS configuration for cross-origin requests
- Rate limiting (configure in Cloudflare dashboard)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and add tests
4. Run the linter and tests: `pnpm lint && pnpm test`
5. Commit your changes: `git commit -am 'Add some feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Create an issue for bug reports or feature requests
- Check the [GitHub Discussions](https://github.com/fungi-argicapco/gov-programs-api/discussions) for community support
- Review the [API documentation](docs/api.md) for detailed endpoint information

## 🗺️ Roadmap

- [ ] Add user authentication and authorization
- [ ] Implement caching strategies
- [ ] Add analytics and usage tracking  
- [ ] Integrate with more government data sources
- [ ] Add GraphQL endpoint
- [ ] Implement webhooks for real-time updates
- [ ] Add machine learning for program recommendations
