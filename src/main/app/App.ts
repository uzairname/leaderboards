import { Env } from '../..'
import { DbClient } from '../../database/client'
import { getNeonDrizzleClient } from '../../database/drizzle-client'
import { Guild } from '../../database/models'
import {
  DiscordAPIClient,
  overwriteDiscordCommandsWithViews,
  respondToInteraction,
} from '../../discord-framework'
import { sentry } from '../../logging/sentry'
import { onViewError } from '../bot/errors/on_view_error'
import { AppEvents, getAppEvents } from './AppEvents'
import { Config } from './Config'
import { ViewModule } from './ViewModule'

const direct_response_in_dev = true

export class App {
  public db: DbClient
  public discord: DiscordAPIClient
  public config: Config
  public views: ViewModule
  public events: AppEvents

  constructor(
    env: Env,
    all_views: ViewModule,
    all_event_listeners: ((events: AppEvents) => void)[],
  ) {
    this.config = new Config(env)

    const drizzle = getNeonDrizzleClient(
      this.config.env.POSTGRES_URL,
      this.config.env.POSTGRES_READ_URL,
      sentry,
    )

    this.db = new DbClient(drizzle)

    this.discord = new DiscordAPIClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })

    this.views = all_views

    this.events = getAppEvents(this, all_event_listeners)
  }

  handleInteractionRequest(request: Request) {
    return respondToInteraction(
      this.discord,
      request,
      this.views.getFindViewCallback(this),
      onViewError(this),
      this.config.features.IsDev ? direct_response_in_dev : true,
    )
  }

  async syncDiscordCommands(guild?: Guild) {
    return await overwriteDiscordCommandsWithViews(
      this.discord,
      await this.views.getAllCommandSignatures(this, guild),
      guild?.data.id,
    )
  }
}
