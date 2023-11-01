import { DiscordRESTClient } from '../discord'
import { DbClient } from '../database/client'
import { Config } from '../config/config'
import { RequestArgs } from '../utils/request'
import { Sentry } from '../utils/sentry'

export class App {
  public db: DbClient
  public bot: DiscordRESTClient
  public config: Config

  constructor(
    ctx: RequestArgs,
    public sentry: Sentry,
  ) {
    this.config = new Config(ctx)
    this.db = new DbClient(this.config.env.POSTGRES_URL, sentry)
    this.bot = new DiscordRESTClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })
  }

  debug(...messages: unknown[]) {
    this.sentry.debug(...messages)
  }
}
