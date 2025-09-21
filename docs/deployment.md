# Deployment Guide

This guide covers deploying the Government Programs API to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Node.js 18+**: Install from [nodejs.org](https://nodejs.org)
3. **pnpm**: Install with `npm install -g pnpm`
4. **wrangler CLI**: Included in the project dependencies

## Initial Setup

### 1. Clone and Install

```bash
git clone https://github.com/fungi-argicapco/gov-programs-api.git
cd gov-programs-api
pnpm install
```

### 2. Cloudflare Authentication

```bash
npx wrangler login
```

This will open a browser window to authenticate with Cloudflare.

### 3. Create D1 Database

```bash
cd apps/api
npx wrangler d1 create gov-programs-db
```

Copy the database ID from the output and update both `wrangler.toml` files:

```toml
[[d1_databases]]
binding = "DB"
database_name = "gov-programs-db"
database_id = "your-actual-database-id-here"
```

### 4. Initialize Database Schema

```bash
# Generate migrations
cd ../../packages/db
npx drizzle-kit generate:sqlite

# Apply migrations to remote database
cd ../../apps/api
npx wrangler d1 migrations apply gov-programs-db --remote
```

## Manual Deployment

### Deploy API Worker

```bash
cd apps/api
npx wrangler deploy --env production
```

### Deploy Ingest Worker

```bash
cd apps/ingest
npx wrangler deploy --env production
```

## Automated Deployment with GitHub Actions

### 1. Get Cloudflare Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with these permissions:
   - Account: `Zone:Read`, `Account Settings:Read`  
   - Zone Resources: `Include All zones`
   - Account Resources: `Include All accounts`
3. Get your Account ID from the right sidebar

### 2. Configure Repository Secrets

In your GitHub repository settings, add these secrets:

- `CLOUDFLARE_API_TOKEN`: Your API token from step 1
- `CLOUDFLARE_ACCOUNT_ID`: Your account ID from step 1

### 3. Deploy Automatically

- Push to `develop` branch → deploys to staging
- Push to `main` branch → deploys to production

## Environment Configuration

### Development

```bash
# Local development
pnpm --filter @gov-programs/api dev
```

### Staging

Update `apps/api/wrangler.toml` and `apps/ingest/wrangler.toml`:

```toml
[env.staging]
name = "gov-programs-api-staging"
vars = { ENVIRONMENT = "staging" }
```

Deploy:
```bash
npx wrangler deploy --env staging
```

### Production

```bash
npx wrangler deploy --env production
```

## Database Migrations

### Local Development

```bash
# Create migration
cd packages/db
npx drizzle-kit generate:sqlite

# Apply to local database (if using local D1)
cd ../../apps/api  
npx wrangler d1 migrations apply gov-programs-db --local
```

### Production

```bash
# Apply to remote database
npx wrangler d1 migrations apply gov-programs-db --remote
```

## Monitoring and Logs

### View Logs

```bash
# API logs
npx wrangler tail gov-programs-api-prod

# Ingest worker logs  
npx wrangler tail gov-programs-ingest-prod
```

### Analytics

Visit the Cloudflare Dashboard to view:
- Request volume and response times
- Error rates and status codes
- CPU and memory usage
- D1 database metrics

## Custom Domains

### 1. Add Domain to Cloudflare

1. Add your domain to Cloudflare
2. Update nameservers to Cloudflare's

### 2. Configure Routes

```toml
# In wrangler.toml
[env.production]
routes = [
  { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

### 3. Deploy with Custom Domain

```bash
npx wrangler deploy --env production
```

## Troubleshooting

### Common Issues

**"Database not found"**
- Ensure database ID is correct in `wrangler.toml`
- Check that migrations have been applied

**"Module not found"**
- Run `pnpm build` before deploying
- Check import paths use `.js` extensions

**"Deployment failed"**
- Verify Cloudflare API token permissions
- Check account ID is correct
- Ensure wrangler is authenticated: `npx wrangler whoami`

### Debug Mode

```bash
# Enable debug logging
npx wrangler deploy --env production --debug
```

### Local Testing

```bash
# Test API locally
cd apps/api
npx wrangler dev

# Test ingest worker locally  
cd apps/ingest
npx wrangler dev
```

## Security Considerations

1. **API Tokens**: Use tokens with minimal required permissions
2. **Environment Variables**: Store sensitive data in Cloudflare environment variables
3. **CORS**: Configure appropriate CORS policies in production
4. **Rate Limiting**: Enable Cloudflare rate limiting for your domain

## Scaling

### Database Scaling

- Monitor D1 database usage in Cloudflare dashboard
- Consider database sharding for very large datasets
- Use read replicas if available

### Worker Scaling

- Cloudflare Workers scale automatically
- Monitor CPU time limits (100ms per request)
- Use Durable Objects for stateful operations if needed

### Caching

```bash
# Add caching headers in API responses
c.header('Cache-Control', 'public, max-age=300')
```

## Backup and Recovery

### Database Backup

```bash
# Export database
npx wrangler d1 backup gov-programs-db
```

### Configuration Backup

- Store `wrangler.toml` files in version control
- Document environment variables and secrets
- Keep API token secure and rotated regularly