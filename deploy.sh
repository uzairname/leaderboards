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
# Assumes repository structure:
# .
# ├── packages
# │   └── database
# │       └── scripts
# │           └── migrate.ts
cd packages/database

npx tsx scripts/migrate.ts ../../$env_path
if [ $? -ne 0 ]; then
  exit 1
fi
cd ../..


# Deploy to Cloudflare Workers
# Assumes repository structure:
# .
# ├── apps
# │   └── bot
# └── wrangler.toml
cd apps/bot

# Check if ENVIRONMENT variable is set
if [ -z "$ENVIRONMENT" ]; then
  echo "ENVIRONMENT variable is not set. Defaulting to 'development'."
  ENVIRONMENT="development"
fi

if [ "$ENVIRONMENT" = "development" ]; then
  wrangler deploy
else
  wrangler deploy --env $ENVIRONMENT
fi
if [ $? -ne 0 ]; then
  exit 1
fi

cd ../..
# Wait for cloudflare deployment
sleep 3


# Call update endpoint
# check if BASE_URL and APP_KEY variable is set
if [ -z "$BASE_URL" ] || [ -z "$APP_KEY" ]; then
  echo -e "\033[31mBASE_URL or APP_KEY variable is not set.\033[0m"
  exit 1
fi

status_code=$(curl -s -w "%{http_code}" -X POST $BASE_URL/update -H "Authorization: $APP_KEY" -o response.txt)
if [ $? -ne 0 ]; then
  exit 1
fi

cat response.txt
if [ $status_code -ne 200 ]; then
  echo -e "\033[31mUpdate failed with status code: $status_code\033[0m"
  exit 1
fi

echo 
echo -e "\033[32mDone\033[0m"
