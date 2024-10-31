import * as D from 'discord-api-types/v10'
import { Env } from '../..'

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
    D.PermissionFlagsBits.ManageMessages |
    D.PermissionFlagsBits.ManageThreads |
    D.PermissionFlagsBits.ManageRoles

  readonly ChallengeTimeoutMs = 1000 * 60 * 10

  readonly DisplayMeanRating = 1000
  readonly DisplaySdOffset = -0.6
  
  constructor(
    readonly env: Env,

    readonly OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect,

    readonly IsDev = env.ENVIRONMENT === 'development',

    readonly DirectResponse = IsDev ? true : true,

    readonly features = {
      GiveBotInvite: !IsDev,
      HelpReference: IsDev,
      ExperimentalCommands: IsDev,
      QueueMessage: false,
      DisableLogMatchesOption: false,
      MultipleTeamsPlayers: false,
      RoleConnectionsElo: false,
    },

    readonly ProvisionalRdThreshold = IsDev ? 0.85 : 1,
  ) {}
}
