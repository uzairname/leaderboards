import { DbClient, getNeonDrizzleClient } from '@repo/db'
import { Guild } from '@repo/db/models'
import { DiscordAPIClient, putDiscordCommands, ViewManager } from '@repo/discord'
import { Env } from '../Env'
import { sentry } from '../logging/sentry'
import { Config } from './config'
import { AppEvents, getAppEvents } from './events'
import { DbLoggerWrapper, DiscordLoggerWrapper } from './middleware/loggers'
import { onViewError } from './middleware/on-view-error'

export class App {
  public config: Config
  public discord: DiscordAPIClient
  public db: DbClient
  public events: AppEvents

  private discord_logger: DiscordLoggerWrapper

  constructor(
    public env: Env,
    public view_manager: ViewManager<App>,
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

  syncDiscordCommands(guild?: Guild) {
    sentry.offload(
      async () => {
        await putDiscordCommands(
          this.discord,
          await this.view_manager.commandSignatures({
            guild_id: guild?.data.id,
            include_experimental: this.config.features.ExperimentalCommands,
            arg: this,
          }),
          guild?.data.id,
        )
      },
      undefined,
      `Sync ${guild ? 'guild' : 'global'} commands`,
    )
  }
}
