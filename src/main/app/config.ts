import { features } from './features'
import { RequestArgs } from '../../request/request'

export class Config {
  readonly routes = {
    INTERACTIONS: '/interactions',
    OAUTH_CALLBACK: '/oauth/callback',
    OAUTH_LINKED_ROLES: '/oauth/linkedroles',
    TEST: '/test',
    INIT: '/init',
    BASE_API: '/api',
  }

  readonly DEV_GUILD_ID = '1041458052055978024'

  readonly HOME_GUILD_ID: string
  readonly home_guild_ids: { [key: string]: string } = {
    development: this.DEV_GUILD_ID,
    staging: '1003698664767762575', //private server
    production: '1110286104734740595', //support server
  }

  readonly features: ReturnType<typeof features>

  readonly OAUTH_REDIRECT_URI: string

  readonly env: Env

  constructor(ctx: RequestArgs) {
    this.env = ctx.env
    this.HOME_GUILD_ID = this.home_guild_ids[this.env.ENVIRONMENT]
    this.OAUTH_REDIRECT_URI = this.env.BASE_URL + this.routes.OAUTH_CALLBACK
    this.features = features(this.env.ENVIRONMENT)
  }
}
