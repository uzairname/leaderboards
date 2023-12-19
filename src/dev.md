# Hosting and developing

> Reference for myself and maybe anyone else

## Deployment Setup

### Cloudflare Workers

In the Cloudflare dashboard, save your api token as `CF_API_TOKEN`

For each environment, create a cloudflare worker. Update the worker's name in `wrangler.toml`. The following variables should match in the worker's environment variables and in `wrangler.toml`

- `ENVIRONMENT`. e.g. "production"

- `BASE_URL` in the format `https://<subdomain>.workers.dev`

### Discord

For each environment, create a Discord app. Save the `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, and `CLIENT_SECRET` variables

In the dev portal, set the _interactions endpoint url_, _linked roles verification url_, and the _oauth redirect URI_ to `https://<subdomain>.workers.dev/<endpoint>` according to the endpoints in `src/main/router.ts`

### Database

For each environment, create a Neon database. Save the pooled connection string as `POSTGRES_URL` or `POSTGRES_URL_TEST`

### Sentry

Create a "browser javascript" Sentry project. Save the `SENTRY_DSN` variable

## Deploying with GitHub Actions

### Environment secrets

For each environment, set these as environment secrets in GitHub Actions

- `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, `CLIENT_SECRET`, and `POSTGRES_URL`

### Repository Secrets

Set the following as repository secrets in GitHub Actions

- `SENTRY_DSN` to the Sentry DSN

- `APP_KEY` to a random string. It's used to authenticate requests to the deploy and test endpoints

- `CF_API_TOKEN` to the cloudflare api token

### Workflow file

In the workflow file for each environment in `.github/workflows`, set the `INIT_APP_ENDPOINT` environment variable to `https://<subdomain>.workers.dev/init`

## Deploying Dev Environments

### Source code

```bash
npm install
npx tsc
```

### Migrating

Generate migrations

```
npx drizzle-kit generate:pg
```

Set `POSTGRES_URL` and optionally `POSTGRES_URL_TEST` in `.env`
Migrate database

```bash
tsx migrations/migrate.ts
```

### Deploy worker

Set all of the environment variables in the Cloudflare worker with `wrangler secret put <secret>` for each of `DISCORD_TOKEN`, `APPLICATION_ID`, `PUBLIC_KEY`, `CLIENT_SECRET`, `POSTGRES_URL`, `SENTRY_DSN`, and `APP_KEY`

Deploy worker

```bash
wrangler deploy
```

### Initialize app

Initialize the app's slash commands and role connections metadata:

```bash
curl.exe -X POST https://<subdomain>.workers.dev/init -H "Authorization:<APP_KEY>"
```

## Testing

Create a .dev.vars file with a testing `POSTGRES_URL`, `APP_KEY`, and `SENTRY_DSN`

```bash
wrangler dev
curl.exe -X POST <localhost url>/test -H "Authorization:<app key>"
```

<!--

current total gzip size: 296.02 KiB

-->
