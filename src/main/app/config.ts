import * as D from 'discord-api-types/v10'

export const features = (environment: string) => {
  const dev = environment === 'development'

  return {
    RoleConnectionsMetadata: dev,
    QueueMessage: dev,
    HelpReference: dev,

    ExperimentalViews: dev,
    DevGuildCommands: dev,
    DetailedErrorMessages: dev,
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

  readonly settings = settings

  constructor(readonly env: Env) {
    this.OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect
    this.features = features(env.ENVIRONMENT)
  }
}

const settings = {
  MaxRescoreableMatches: 1500,
}
