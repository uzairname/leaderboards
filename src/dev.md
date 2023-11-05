# Hosting and developing

> Reference for myself, and maybe open source contributors and potential collaborators

## Deployment Setup

### Cloudflare Workers

For each environment, create a cloudflare worker.

Update the worker's name in `wrangler.toml`. Set the following as environment variables in the worker and in `wrangler.toml`

- `ENVIRONMENT`. e.g. "production".
- `BASE_URL` as a worker environment variable. e.g. `https://<subdomain>.workers.dev`.

### Discord Application

For each environment, create a Discord app. In the dev portal, set the "interactions endpoint url", "linked roles verification url", and an oauth redirect to something like `https://<subdomain>.workers.dev/<endpoint>` according to the endpoints in `src/main/router.ts`.

### Neon Database

For each environment, create a Neon database.

### Sentry

Create a "browser javascript" Sentry project.

## Testing

`test/test.ts` tests database, discord, and app functionality. Provide a separate test database with the `POSTGRES_URL` environment variable.

```bash
curl -X POST https://<subdomain>.workers.dev/test -H "Authorization:<APP_KEY>"
```

## Deploying with GitHub Actions

For staging and production, there's a deployment workflow in `.github/workflows`.

### Environment secrets

For each environment, set the following environment secrets.

- `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, and `CLIENT_SECRET`
- `POSTGRES_URL` to the pooled connection string of the neon database.

### Repository Secrets

Set the following as repository secrets (independently of environment).

- `SENTRY_DSN` to the Sentry DSN.
- `APP_KEY` to a random string. It's used to authenticate requests to the `/init` and `/test` endpoints.
- `CF_API_TOKEN` to the cloudflare api token.

### Workflow file

workflow for the environment in `.github/workflows`, set the `INIT_APP_ENDPOINT` environment variable to the url of the `https://<subdomain>.workers.dev/init` endpoint of the worker.

## Deploying manually

For development.

### Source code

Clone the repo and install packages: `npm install`

Compile typescript: `npx tsc`

### Migrating

Generate migrations: `npx drizzle-kit generate:pg`

Migrate database: `tsx migrations/migrate.ts` (Need to set the `POSTGRES_URL` variable in `.env`)

### Deploy worker

Set all of the environment variables in the Cloudflare worker.

```bash
wrangler deploy
```

### Initialize app

Initialize the app's slash commands and role connections metadata:

```
curl.exe -X POST https://<subdomain>.workers.dev/init -H "Authorization:<APP_KEY>"
```

<!--

Total Upload: 1094.97 KiB / gzip: 211.31 KiB

npx drizzle-kit generate:pg
npx tsx .\migrations\migrate.ts

test: test.bat

-->
