import { DbClient, getNeonDrizzleClient } from '@repo/db'
import { PartialGuild } from '@repo/db/models'
import { DiscordAPIClient, InteractionHandler, putDiscordCommands } from '@repo/discord'
import { Env } from '../Env'
import { onViewError } from '../errors/on-view-error'
import { sentry } from '../logging/sentry'
import { DbLoggerWrapper, DiscordLoggerWrapper } from '../logging/wrappers'
import { Config } from './config'
import { AppEvents, getAppEvents } from './events'

export class App {
  public config: Config
  public discord: DiscordAPIClient
  public db: DbClient
  public events: AppEvents

  private discord_logger: DiscordLoggerWrapper

  constructor(
    public env: Env,
    public view_manager: InteractionHandler<App>,
    public all_event_listeners: ((events: AppEvents) => void)[],
    {
      db,
      config,
    }: {
      db?: DbClient
      config?: Config
    } = {},
  ) {
    this.config = config ?? new Config(env)

    if (db) {
      this.db = db
    } else {
      const logger = new DbLoggerWrapper(sentry)
      const drizzle = getNeonDrizzleClient(this.config.env.POSTGRES_URL, this.config.env.POSTGRES_READ_URL, logger)
      this.db = new DbClient(drizzle, logger)
    }
    this.db.cache.clear()

    this.discord_logger = new DiscordLoggerWrapper(sentry)

    this.discord = new DiscordAPIClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
      logger: this.discord_logger,
    })

    this.events = getAppEvents(this, all_event_listeners)

    this.view_manager.logger = this.discord_logger
  }

  handleInteractionRequest(request: Request) {
    return this.view_manager.respond({
      bot: this.discord,
      request,
      onError: onViewError(this),
      offload: sentry.offload.bind(sentry),
      direct_response: this.config.DirectResponse,
      arg: this,
    })
  }

  /**
   * Syncs either global or guild-specific app commands on Discord.
   */
  async syncDiscordCommands(guild?: PartialGuild) {
    await putDiscordCommands(
      this.discord,
      await this.view_manager.getCommandSignatures({
        guild_id: guild?.data.id,
        include_experimental: this.config.features.ExperimentalCommands,
        arg: this,
      }),
      guild?.data.id,
    )
  }
}
