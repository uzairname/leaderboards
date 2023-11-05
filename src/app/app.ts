import { DiscordRESTClient } from '../discord'
import { DbClient } from '../database/client'
import { AppConfig } from './config/config'
import { Env } from '../utils/request'
import { Sentry } from '../utils/sentry'

export class App {
  public db: DbClient
  public bot: DiscordRESTClient
  public config: AppConfig
  public eventListeners: Record<string, (...args: unknown[]) => void> = {}

  constructor(env: Env) {
    this.config = new AppConfig(env)
    this.db = new DbClient(this.config.env.POSTGRES_URL)
    this.bot = new DiscordRESTClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })
  }

  listen(name: string, listener: (...args: unknown[]) => void) {
    this.eventListeners[name] = listener
  }

  emit(name: string, ...args: unknown[]) {
    this.eventListeners[name](...args)
  }
}
