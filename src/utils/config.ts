import { PermissionFlagsBits } from 'discord-api-types/v10'
import { Env } from './env'
import { features } from './features'

export class Config {
  readonly REQUIRED_BOT_PERMISSIONS =
    PermissionFlagsBits.ManageChannels |
    PermissionFlagsBits.ManageThreads |
    PermissionFlagsBits.ManageRoles

  readonly routes = {
    OAUTH_CALLBACK: '/oauth/callback',
    OAUTH_LINKED_ROLES: '/oauth/linkedroles',
  }

  readonly DEV_GUILD_ID = '1041458052055978024'

  readonly HOME_GUILD_ID: string
  readonly home_guild_ids: { [key: string]: string } = {
    development: this.DEV_GUILD_ID,
    staging: '1003698664767762575', //private server
    production: '1110286104734740595', //support server
  }

  readonly OAUTH_REDIRECT_URI: string

  readonly features: ReturnType<typeof features>

  constructor(
    readonly env: Env,
    readonly execution_context: ExecutionContext,
  ) {
    this.HOME_GUILD_ID = this.home_guild_ids[env.ENVIRONMENT]
    this.OAUTH_REDIRECT_URI = env.BASE_URL + this.routes.OAUTH_CALLBACK
    this.features = features(env.ENVIRONMENT)
  }
}
