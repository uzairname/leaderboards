import { sentry } from '../../request/sentry'
import { DiscordRESTClient } from '../../discord-framework'
import { DbClient } from '../../database/client'
import { type RequestArgs } from '../../request/request'
import { Config } from './config'
import { addAllEventListeners, events } from './events'

export class App {
  public db: DbClient
  public bot: DiscordRESTClient
  public config: Config
  public events = events()

  constructor(req: RequestArgs) {
    this.config = new Config(req)
    this.db = new DbClient(this.config.env.POSTGRES_URL, sentry)
    this.bot = new DiscordRESTClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })
    addAllEventListeners(this)
  }
}
