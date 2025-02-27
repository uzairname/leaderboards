# Leaderboards Project Guidelines

## Build & Test Commands
- **Build TypeScript**: `npx tsc --p apps/bot/tsconfig.json`
- **Format code**: `npm run fmt`
- **Deploy**: `./deploy.sh [path_to_env_file]`
- **Local development**: `cd apps/bot && wrangler dev`
- **Migrations**: `cd packages/db && npx tsx scripts/migrate.ts ../../[env_file]`
- **Reset DB**: `cd packages/db && npx tsx scripts/reset-db.ts ../../[env_file]`

## Code Info
- **Monorepo**: Discord bot in apps/bot, website in apps/frontend, utilities in packages/
- **Discord API**: Custom library based on Discord.js for interaction with Discord API
- **Discord Bot**: Custom library to handle Discord interactions

## Code Style
- **Formatting**: Single quotes, no semicolons, 120 char line width, 2-space indent
- **Imports**: Organized by @trivago/prettier-plugin-sort-imports with local imports last
- **TypeScript**: Strong typing preferred, avoid `any`
- **Error handling**: Use proper error objects with meaningful messages
- **Naming**: camelCase for variables/functions, PascalCase for classes/types
- **Components**: Study existing components for patterns before creating new ones
- **Database**: Use Drizzle ORM for all database operations
- **ENV Variables**: Store sensitive values in secrets, not in code or version control