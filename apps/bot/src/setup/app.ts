import { DbClient, getNeonDrizzleWsClient } from '@repo/db'
import { PartialGuild } from '@repo/db/models'
import { DiscordAPIClient, DiscordLogger, InteractionHandler, putDiscordCommands } from '@repo/discord'
import { Env } from '../Env'
import { onViewError } from '../errors/on-view-error'
// import * as sentry from '@sentry/cloudflare'
import * as views from '../interactions/all-interaction-handlers'
import { Logger } from '../logging/logger'
import { AppDbLogger, AppDiscordLogger } from '../logging/wrappers'
import { GuildsService } from '../services/guilds/guilds-service'
import { MatchesService } from '../services/matches/matches-service'
import { ScoringService } from '../services/matches/scoring/scoring-service'
import { PlayersService } from '../services/players/players-service'
import { LeaderboardService } from '../services/rankings/leaderboard-service'
import { RankingsService } from '../services/rankings/rankings-service'
import { Config } from './config'

export interface AppServices {
  guilds: GuildsService
  rankings: RankingsService
  players: PlayersService
  matches: MatchesService
  scoring: ScoringService
  lbs: LeaderboardService
}

/**
 * Common dependencies used throughout the application.
 */
export interface App extends AppServices {
  readonly env: Env
  readonly config: Config
  readonly logger: Logger
  readonly db: DbClient
  readonly discord: DiscordAPIClient
  readonly interactionHandler: InteractionHandler<App>
}

/**
 * Initializes the interaction handler with all views
 */
export const getInteractionHandler = (logger?: DiscordLogger) =>
  new InteractionHandler<App>(Object.values(views), logger)

/**
 * Initializes the application with dependencies. Called at the start of every request
 */
export function initApp(env: Env, logger: Logger): App {
  const config = new Config(env)

  const dbLogger = new AppDbLogger(logger)
  const drizzle = getNeonDrizzleWsClient(env.POSTGRES_URL, env.POSTGRES_READ_URL, dbLogger)
  const db = new DbClient(drizzle, dbLogger)

  const discordLogger = new AppDiscordLogger(logger)
  const interactionHandler = getInteractionHandler(discordLogger)
  const discord = new DiscordAPIClient({
    token: config.env.DISCORD_TOKEN,
    applicationId: env.APPLICATION_ID,
    clientSecret: env.CLIENT_SECRET,
    publicKey: env.PUBLIC_KEY,
    logger: discordLogger,
  })

  const services: AppServices = {
    guilds: new GuildsService({ logger }),
    rankings: new RankingsService({ logger }),
    players: new PlayersService({ logger }),
    matches: new MatchesService({ logger }),
    scoring: new ScoringService({ logger }),
    lbs: new LeaderboardService({ logger }),
  }

  const app: App = {
    env,
    config,
    interactionHandler,
    logger,
    db,
    discord,
    ...services,
  }

  return app
}

/**
 * Offloads the execution of a callback to a new app instance, allowing for
 * isolated non-blocking operations
 */
export function offload(app: App, callback: (app: App) => Promise<void>, name?: string) {
  return app.logger.offload(async ({ logger }) => {
    const new_app: App = initApp(app.config.env, logger)
    await callback(new_app)
  }, name)
}

/**
 * Syncs either global or guild-specific app commands on Discord.
 */
export async function syncDiscordCommands(app: App, guild?: PartialGuild) {
  return putDiscordCommands(
    app.discord,
    await app.interactionHandler.getCommandSignatures({
      guild_id: guild?.data.id,
      include_experimental: app.config.features.ExperimentalCommands,
      arg: app,
    }),
    guild?.data.id,
  )
}

/**
 * Responds to a Discord interaction request
 */
export function handleInteractionRequest(app: App, request: Request): Promise<Response> {
  function offload(
    callback: (ctx: { setException: (e: unknown) => void }, app: App) => Promise<void>,
    setException: any,
  ) {
    return app.logger.offload(async ({ logger }) => {
      const new_app: App = initApp(app.config.env, logger)
      await callback({ setException }, new_app)
    })
  }

  return app.interactionHandler.respond({
    discord: app.discord,
    request,
    onError: onViewError(app),
    offload,
    direct_response: app.config.DirectResponse,
    arg: app,
  })
}
