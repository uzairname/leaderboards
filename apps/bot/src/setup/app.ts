import { DbClient, getNeonDrizzleClient, getNeonDrizzleWsClient } from '@repo/db'
import { PartialGuild } from '@repo/db/models'
import { DiscordAPIClient, DiscordLogger, InteractionHandler, putDiscordCommands } from '@repo/discord'
import { Env } from '../Env'
import { onViewError } from '../errors/on-view-error'
// import * as sentry from '@sentry/cloudflare'
import { Logger } from '../logging/logger'
import { AppDbLogger, AppDiscordLogger } from '../logging/wrappers'
import * as views from './all-interaction-handlers'
import { Config } from './config'
import { AppEvents, getAppEvents } from './events'

/**
 * Common dependencies used throughout the application.
 */
export interface App {
  env: Env
  config: Config
  logger: Logger
  db: DbClient
  discord: DiscordAPIClient
  interactionHandler: InteractionHandler<App>
  events?: AppEvents
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
  db.cache.clear()

  const discordLogger = new AppDiscordLogger(logger)
  const interactionHandler = getInteractionHandler(discordLogger)
  const discord = new DiscordAPIClient({
    token: config.env.DISCORD_TOKEN,
    applicationId: env.APPLICATION_ID,
    clientSecret: env.CLIENT_SECRET,
    publicKey: env.PUBLIC_KEY,
    logger: discordLogger,
  })

  const app: App = {
    env,
    config,
    interactionHandler,
    logger,
    db,
    discord,
  }

  const eventListeners: ((events: AppEvents) => void)[] = []
  const events = getAppEvents(app, eventListeners)
  app.events = events

  return app
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
  return app.interactionHandler.respond({
    bot: app.discord,
    request,
    onError: onViewError(app),
    offload: app.logger.offload.bind(app.logger),
    direct_response: app.config.DirectResponse,
    arg: app,
  })
}
