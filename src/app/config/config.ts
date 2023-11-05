import { Env } from '../../utils/request'
import { features } from './features'

export const constants = {
  routes: {
    OAUTH_CALLBACK: '/oauth/callback',
    OAUTH_LINKED_ROLES: '/oauth/linkedroles',
  },
}

export class AppConfig {
  readonly DEV_GUILD_ID = '1041458052055978024'

  readonly HOME_GUILD_ID: string
  readonly home_guild_ids: { [key: string]: string } = {
    development: this.DEV_GUILD_ID,
    staging: '1003698664767762575', //private server
    production: '1110286104734740595', //support server
  }

  readonly features: ReturnType<typeof features>

  readonly OAUTH_REDIRECT_URI: string

  constructor(readonly env: Env) {
    this.HOME_GUILD_ID = this.home_guild_ids[this.env.ENVIRONMENT]
    this.OAUTH_REDIRECT_URI = this.env.BASE_URL + constants.routes.OAUTH_CALLBACK
    this.features = features(this.env.ENVIRONMENT)
  }
}
