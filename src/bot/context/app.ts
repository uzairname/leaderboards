import { Env } from '../../Env'
import { DbClient } from '../../database/client'
import { getNeonDrizzleClient } from '../../database/drizzle-client'
import { Guild } from '../../database/models'
import {
  DiscordAPIClient,
  overwriteDiscordCommandsWithViews,
  respondToInteraction,
} from '../../discord-framework'
import { sentry } from '../../logging/sentry'
import { onViewError } from '../errors/on-view-error'
import { ViewModule } from '../services/ViewModule'
import { Config } from './config'
import { AppEvents, getAppEvents } from './events'

export class App {
  public config: Config
  public discord: DiscordAPIClient
  public db: DbClient
  public events: AppEvents

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
      const drizzle = getNeonDrizzleClient(
        this.config.env.POSTGRES_URL,
        this.config.env.POSTGRES_READ_URL,
        sentry,
      )
      this.db = new DbClient(drizzle)
    }
    this.db.cache.clear()

    this.discord = new DiscordAPIClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })

    this.events = getAppEvents(this, all_event_listeners)
  }

  handleInteractionRequest(request: Request) {
    return respondToInteraction(
      this.discord,
      request,
      this.views.getFindViewCallback(this),
      onViewError(this),
      this.config.DirectResponse,
    )
  }

  async syncDiscordCommands(guild?: Guild) {
    overwriteDiscordCommandsWithViews(
      this.discord,
      await this.views.getAllCommandSignatures(this, guild),
      guild?.data.id,
    )
  }
}
