import { sentry } from '../logging/globals'
import { DiscordRESTClient } from '../discord-framework'
import { DbClient } from '../database/client'
import { type RequestArgs } from '../utils/request'
import { Config } from '../config/config'
import { addRankingChannelsListeners } from './modules/channels/ranking_channels'

export class App {
  public db: DbClient
  public bot: DiscordRESTClient
  public config: Config

  constructor(ctx: RequestArgs) {
    this.config = new Config(ctx)
    this.db = new DbClient(this.config.env.POSTGRES_URL, sentry)
    this.bot = new DiscordRESTClient({
      token: this.config.env.DISCORD_TOKEN,
      application_id: this.config.env.APPLICATION_ID,
      client_id: this.config.env.APPLICATION_ID,
      client_secret: this.config.env.CLIENT_SECRET,
      public_key: this.config.env.PUBLIC_KEY,
    })

    addRankingChannelsListeners(this)
  }

  private event_listeners: { [event: string]: (...args: any[]) => Promise<void> } = {}

  addEventListener(event: string, listener: (...args: any[]) => Promise<void>) {
    this.event_listeners[event] = listener
  }

  removeEventListener(event: string) {
    delete this.event_listeners[event]
  }

  async emitEvent(event: string, ...args: any[]) {
    if (this.event_listeners[event]) {
      await this.event_listeners[event](...args)
    }
  }
}
