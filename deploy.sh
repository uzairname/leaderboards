#!/bin/bash

# Usage: ./deploy.sh [.env]

# Set environment path. Default to .env
env_path="${1:-.env}"

# Load environment variables
source $env_path

# Run TypeScript compiler
npx tsc
if [ $? -ne 0 ]; then
  exit $?
fi

# Run migrations
npx tsx scripts/migrate.ts $env_path
if [ $? -ne 0 ]; then
  exit $?
fi

# Deploy to Cloudflare Workers
if [ "$ENVIRONMENT" = "development" ]; then
  wrangler deploy
else
  wrangler deploy --env $ENVIRONMENT
fi

if [ $? -ne 0 ]; then
  exit $?
fi

# Wait for deployment
sleep 3

# Call update endpoint
npx tsx scripts/update.ts $env_path
