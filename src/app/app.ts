import { config, sentry } from '../utils/globals'

import { DiscordRESTClient } from '../discord'

import { DbClient } from '../database/client'

export class App {
  public db = new DbClient(sentry)
  public bot = new DiscordRESTClient({
    token: config.env.DISCORD_TOKEN,
    application_id: config.env.APPLICATION_ID,
    client_id: config.env.APPLICATION_ID,
    client_secret: config.env.CLIENT_SECRET,
    public_key: config.env.PUBLIC_KEY,
  })
}
