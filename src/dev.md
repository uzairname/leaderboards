# Hosting and developing

> Reference for myself, open source contributors, and potential collaborators

## Setup

### Cloudflare Workers

Requires a cloudflare account.

For each environment, create a cloudflare worker.

Match its name to the name in `wrangler.toml`.

Set the following as environment variables in the worker and in `wrangler.toml`

- `ENVIRONMENT`. e.g. "production".
- `BASE_URL` as a worker environment variable. e.g. "https://\<subdomain>.workers.dev".

### Discord Application

For each environment, create a Discord app. In the dev portal, set the "interactions endpoint url", "linked roles verification url", and an oauth redirect to something like "https://\<subdomain>.workers.dev/discord/<endpoint>"

### Neon Database

For each environment, create a Neon database.

### Sentry

Create a "browser javascript" Sentry project.

### Source code

Clone the repo and install packages: `npm install`

## Development

Compile typescript: `npx tsc`

Generate migrations: `npx drizzle-kit generate:pg`

Migrate database: `tsx migrations/migrate.ts` (Need to set the `POSTGRES_URL` and optionally `POSTGRES_URL_TEST` environment variables in `.env`)

## Testing

The `/test` endpoint is used to test database, discord, and app functionality. It typically runs in the development environment. It requires a test database with the `POSTGRES_URL_TEST` worker environment variable.

```bash
curl -X POST https://<subdomain>.workers.dev/test -H "Authorization:<APP_KEY>"
```

## Deploying with GitHub Actions

For staging and production, there's a deployment workflow in `.github/workflows`.

**Environment secrets**
For each environment, set the following environment secrets.

- `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, and `CLIENT_SECRET`
- `POSTGRES_URL` to the pooled connection string of the neon database.

**Repository Secrets**
Set the following as repository secrets.

- `SENTRY_DSN` to the Sentry DSN.
- `APP_KEY` to a random string. It's used to authenticate requests to the `/init` and `/test` endpoints.
- `CF_API_TOKEN` to the cloudflare api token.

**Workflow file**

In the workflows in `.github/workflows`, set the `INIT_APP_ENDPOINT` environment variable to the url of the `/init` endpoint of the worker.

## Deploying manually

Set all of the environment variables in the Cloudflare worker.

Deploy the worker:

```bash
wrangler deploy
```

Initialize the app's slash commands and role connections metadata:

```
curl.exe -X POST https://<subdomain>.workers.dev/init -H "Authorization:<APP_KEY>"
```

<!--

current total gzip size: 203.02 KiB

npx drizzle-kit generate:pg
npx tsx .\src\database\migrate.ts

test: test.bat

-->
