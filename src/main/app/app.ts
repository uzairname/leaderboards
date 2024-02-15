import { DbClient } from '../../database/client'
import { DiscordAPIClient } from '../../discord-framework'
import { sentry } from '../../request/sentry'
import { Config } from './config'
import { addAllEventListeners, events } from './init/events'

export class App {
  public db: DbClient
  public bot: DiscordAPIClient
  public config: Config
  public events = events()

  constructor(env: Env) {
    this.config = new Config(env)
    this.db = new DbClient(this.config.env.POSTGRES_URL, sentry)
    this.bot = new DiscordAPIClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })
    addAllEventListeners(this)
  }
}
