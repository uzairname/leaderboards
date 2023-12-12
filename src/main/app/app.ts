import { sentry } from '../../request/sentry'
import { DiscordRESTClient } from '../../discord-framework'
import { DbClient } from '../../database/client'
import { type RequestArgs } from '../../request/request'
import { Config } from './config'
import { addRankingChannelsListeners } from '../modules/channels/ranking_channels'
import { addMatchSummaryMessagesListeners } from '../modules/channels/match_summary_channels'

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
    addMatchSummaryMessagesListeners(this)
  }

  private event_callbacks: { [event: string]: ((...args: any[]) => Promise<void>)[] } = {}

  on(event: string, callback: (...args: any[]) => Promise<void>) {
    if (this.event_callbacks[event]) {
      return void this.event_callbacks[event].push(callback)
    }
    this.event_callbacks[event] = [callback]
  }

  removeEventListener(event: string) {
    delete this.event_callbacks[event]
  }

  async emitEvent(event: string, ...args: any[]) {
    sentry.debug(`Emitting event ${event}`)
    if (this.event_callbacks[event]) {
      sentry.debug(`Calling event callbacks for ${event}`)
      await Promise.all(this.event_callbacks[event].map((callback) => callback(...args)))
    }
  }
}
