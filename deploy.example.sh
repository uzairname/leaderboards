#!/bin/bash

# Run TypeScript compiler
npx tsc
if [ $? -ne 0 ]; then
  exit $?
fi

# Run migrations
npx tsx migrations/migrate.ts
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
curl -X POST https://your-worker.your-subdomain.workers.dev/update -H "Authorization:your-app-key"
