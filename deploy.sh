#!/bin/bash

env_path="${1:-.env}"

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
wrangler deploy
if [ $? -ne 0 ]; then
  exit $?
fi

# Wait for deployment
sleep 3

# Call update endpoint
npx tsx scripts/update.ts $env_path
