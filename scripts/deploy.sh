#!/bin/bash

# Government Programs API Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Government Programs API Deployment${NC}"
echo "=================================="

# Check if environment argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Environment not specified${NC}"
    echo "Usage: ./scripts/deploy.sh [staging|production]"
    exit 1
fi

ENVIRONMENT=$1

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
    echo "Valid options: staging, production"
    exit 1
fi

echo -e "${YELLOW}Deploying to: $ENVIRONMENT${NC}"

# Pre-deployment checks
echo -e "\n${YELLOW}Running pre-deployment checks...${NC}"

# Check if wrangler is authenticated
if ! npx wrangler whoami > /dev/null 2>&1; then
    echo -e "${RED}Error: Wrangler not authenticated${NC}"
    echo "Run: npx wrangler login"
    exit 1
fi

# Install dependencies
echo -e "\n${YELLOW}Installing dependencies...${NC}"
pnpm install --frozen-lockfile

# Run tests
echo -e "\n${YELLOW}Running tests...${NC}"
pnpm test

# Type checking
echo -e "\n${YELLOW}Type checking...${NC}"
pnpm typecheck

# Build packages
echo -e "\n${YELLOW}Building packages...${NC}"
pnpm build

# Deploy API
echo -e "\n${YELLOW}Deploying API to Cloudflare Workers...${NC}"
cd apps/api
npx wrangler deploy --env $ENVIRONMENT

# Deploy Ingest Worker
echo -e "\n${YELLOW}Deploying Ingest Worker...${NC}"
cd ../ingest
npx wrangler deploy --env $ENVIRONMENT

cd ../..

# Success message
echo -e "\n${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "Environment: ${GREEN}$ENVIRONMENT${NC}"
echo ""
echo "Next steps:"
echo "1. Test the deployed API endpoints"
echo "2. Verify the ingest worker is scheduled correctly"
echo "3. Check Cloudflare dashboard for metrics"
echo ""
echo "API endpoints:"
echo "• Health check: GET /"
echo "• Search programs: GET /api/v1/programs"
echo "• Get stats: GET /api/v1/stats"