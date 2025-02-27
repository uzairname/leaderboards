#!/bin/bash

# Deploys to Cloudflare Workers and runs database migrations
# Usage: ./deploy.sh <path_to_env_file>

# Set environment path. Default to .env
env_path="${1:-.env}"

# Load environment variables
source $env_path
if [ $? -ne 0 ]; then
  exit 1
fi

# Run TypeScript compiler
npx tsc --p apps/bot/tsconfig.json
if [ $? -ne 0 ]; then
  exit 1
fi

# Run migrations
cd packages/db

npx tsx scripts/migrate.ts ../../$env_path
if [ $? -ne 0 ]; then
  exit 1
fi
cd ../..


# Deploy to Cloudflare Workers
cd apps/bot

if [ "$ENVIRONMENT" = "development" ] || [ -z "$ENVIRONMENT" ]; then
  echo -e "\033[33mDeploying to development environment\033[0m"
  wrangler deploy
else
  echo -e "\033[32mDeploying to $ENVIRONMENT environment\033[0m"
  wrangler deploy --env $ENVIRONMENT
fi
if [ $? -ne 0 ]; then
  exit 1
fi

cd ../..

# Wait for cloudflare deployment
sleep 3

# Call update endpoint
status_code=$(curl -s -w "%{http_code}" -X POST $BASE_URL/update -H "Authorization: $APP_KEY" -o /dev/null)
if [ $? -ne 0 ]; then
  echo -e "\033[31mUpdate app failed\033[0m"
  exit 1
fi
if [ $status_code -ne 200 ]; then
  echo -e "\033[31mUpdate failed with status code: $status_code\033[0m"
  exit 1
fi

echo -e "\033[32mUpdated app\033[0m"
