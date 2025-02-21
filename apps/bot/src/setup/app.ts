import { DbClient, getNeonDrizzleClient } from '@repo/database'
import { Guild } from '@repo/database/models'
import {
  DiscordAPIClient,
  overwriteDiscordCommandsWithViews,
  respondToInteraction,
  ViewStateFactory,
} from '@repo/discord'
import { ViewModule } from '../classes/ViewModule'
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
    public views: ViewModule,
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
      const drizzle = getNeonDrizzleClient(
        this.config.env.POSTGRES_URL,
        this.config.env.POSTGRES_READ_URL,
        logger,
      )
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
  }

  handleInteractionRequest(request: Request) {
    return respondToInteraction(
      this.discord,
      request,
      this.views.getFindViewCallback(this),
      onViewError(this),
      sentry.offload.bind(sentry),
      this.config.DirectResponse,
      this.discord_logger,
    )
  }

  syncDiscordCommands(guild?: Guild) {
    sentry.offload(
      async () => {
        overwriteDiscordCommandsWithViews(
          this.discord,
          await this.views.getAllCommandSignatures(this, guild),
          guild?.data.id,
        )
      },
      undefined,
      `Put ${guild ? 'guild' : 'global'} commands`,
    )
  }

  fromCustomId(custom_id: string) {
    return ViewStateFactory.fromCustomId(
      custom_id,
      this.views.findViewSignatureFromCustomId(),
      this.discord_logger,
    )
  }
}
