# Leaderboards

A Discord bot that handles elo rating, matchmaking, and leaderboards.

# Deploying the Bot

## Setup

Run 

```bash
npm install && \
npm install -g wrangler
```

### 1. Cloudflare Workers

For each environment, create a Cloudflare worker. Update the worker's name in `wrangler.toml`. The following variables should match in the worker's environment variables and in the `wrangler.toml`

- `ENVIRONMENT`. e.g. "production"

- `BASE_URL` in the format `https://<subdomain>.workers.dev`

### 2. Discord

For each environment, create a Discord app. Save the `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, and `CLIENT_SECRET` variables

In the dev portal, set the _interactions endpoint url_, _oauth redirect URI_, and the _linked roles verification url_ to `<BASE_URL><endpoint>`, based on the endpoints defined in `src/routers/api.ts`

### 3. Neon Database

For each environment, create a Neon database. Save the pooled connection string as `POSTGRES_URL`

### 4. Sentry

Create a "browser javascript" Sentry project. Save the `SENTRY_DSN` variable

### 5. Save Environment Variables

For each environment, create a env file at the root of the repository with the following variables

```
ENVIRONMENT
BASE_URL
POSTGRES_URL
APP_KEY
```

For each environment, set all the following environment variables in the Cloudflare worker with `wrangler secret put <secret name>`:

- `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, `CLIENT_SECRET`, `POSTGRES_URL`, `SENTRY_DSN`, and `APP_KEY`

## Deploying Step by Step

### 1. Generate migrations

```bash
cd packages/database && \
npx drizzle-kit generate
```

### 2. Run migrations

```bash
npx tsx scripts/migrate.ts ../../<path/to/.env>
```

### 3. Deploy worker

```bash
cd ../../apps/bot && \
wrangler deploy
```

### 4. Update app

```bash
curl -X POST <BASE_URL>/update -H "Authorization: <APP_KEY>"
```

## Deploying From Script

Run
```bash
./deploy.sh
```

To specify an environment file, run
```bash
./deploy.sh <path/to/.env>
```

## Testing Locally

Create a .dev.vars file with a testing `POSTGRES_URL`, `APP_KEY`, and `SENTRY_DSN`

```bash
wrangler dev
```

<!--

current total gzip size: 351.94 KiB

-->
