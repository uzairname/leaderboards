An elo rating Discord bot.

# Deploying

## Setup

Clone the repo then run 
```bash
npm install && \
npm install -g wrangler
```

### 1. Cloudflare Workers

For each environment, create a [Cloudflare worker](https://developers.cloudflare.com/workers/get-started/guide/). Update the worker's name in `wrangler.toml`. The following variables should match in the worker's environment variables and in the `wrangler.toml`

- `ENVIRONMENT`. e.g. "production"

- `BASE_URL` in the format `https://<subdomain>.workers.dev`

### 2. Discord

For each environment, create a [Discord app](https://discord.com/developers/applications). Save the `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, and `CLIENT_SECRET` variables

In the dev portal, set the _interactions endpoint url_, _oauth redirect URI_, and the _linked roles verification url_ to `<BASE_URL><endpoint>`, based on the endpoints defined in `apps/bot/src/routers/api.ts`

### 3. Neon Database

For each environment, create a [Neon database](https://console.neon.tech/app/projects). Save the pooled connection string as `POSTGRES_URL`

### 4. Sentry

Create a [Sentry project](https://sentry.io/signup/), and select the "browser javascript" platform. Save the `SENTRY_DSN` variable

### 5. Save Environment Variables

For each environment, create an env file at the root of the repository and specify the following variables

```
ENVIRONMENT
BASE_URL
POSTGRES_URL
APP_KEY
```

For each environment, set all the following environment variables in the Cloudflare worker with `wrangler secret put <secret name>`:

- `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, `CLIENT_SECRET`, `POSTGRES_URL`, `SENTRY_DSN`, and `APP_KEY`


## Deploy Worker

Run this once: 

```bash
chmod +x ./deploy.sh
```

To compile typescript, deploy the worker, run db migrations, and call the update endpoint, run `./deploy.sh`

To specify an environment file, run `./deploy.sh <path/to/env/file>`

## Useful commands

### Compile typescript

Run `npx tsc` from the `apps/bot` directory

### Database

Run these commands from the `packages/db` directory

#### Generate migrations

```bash
npx drizzle-kit generate
```

#### Migrate database

```bash
npx tsx scripts/migrate.ts ../../<path/to/env/file>
```

#### Clear all tables

```bash
npx tsx scripts/reset-db.ts ../../<path/to/env/file>
```

### Deploy worker

```bash
cd ../../apps/bot && \
wrangler deploy
```

### Call update endpoint

```bash
curl -X POST <BASE_URL>/update -H "Authorization: <APP_KEY>"
```

### Test locally

Create a .dev.vars file with a testing `POSTGRES_URL`, `APP_KEY`, and `SENTRY_DSN`

```bash
wrangler dev
```

<!--

current total gzip size: 404.38 KiB

-->
