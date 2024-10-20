import * as D from 'discord-api-types/v10'

export const features = (environment: string) => {
  const is_dev = environment === 'development'

  return {
    HelpReference: is_dev,
    IsDev: is_dev,
  }
}

export class Config {
  readonly OauthRoutes = {
    Redirect: '/redirect',
    LinkedRoles: '/linkedroles',
    BotAndRoleConnections: '/auth',
    Bot: '/invite',
  }

  readonly DevGuildId = '1041458052055978024'

  readonly OwnerIds = ['991398096565182467', '375438205253713933']

  readonly RequiredBotPermissions =
    D.PermissionFlagsBits.ManageChannels |
    D.PermissionFlagsBits.ManageThreads |
    D.PermissionFlagsBits.ManageRoles

  public readonly OauthRedirectURI: string
  readonly features: ReturnType<typeof features>

  constructor(readonly env: Env) {
    this.OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect
    this.features = features(env.ENVIRONMENT)
  }
}
