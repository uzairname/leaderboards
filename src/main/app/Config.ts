import * as D from 'discord-api-types/v10'
import { Env } from '../..'

export class Config {
  readonly OauthRoutes = {
    Redirect: '/redirect',
    LinkedRoles: '/linkedroles',
    BotAndRoleConnections: '/auth',
    Bot: '/invite',
  }

  readonly OauthRedirectURI: string

  readonly DevGuildId = '1041458052055978024'

  readonly OwnerIds = ['991398096565182467', '375438205253713933']

  readonly RequiredBotPermissions =
    D.PermissionFlagsBits.ManageChannels |
    D.PermissionFlagsBits.ManageMessages |
    D.PermissionFlagsBits.ManageThreads |
    D.PermissionFlagsBits.ManageRoles

  readonly features

  readonly ChallengeTimeoutMs = 1000 * 60 * 10

  readonly display_mean_rating = 1000
  readonly display_sd_offset = -0.6
  readonly provisional_rd_threshold = 1

  constructor(readonly env: Env) {
    this.OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect

    const is_dev = env.ENVIRONMENT === 'development'

    this.features = {
      HelpReference: is_dev,
      IsDev: is_dev,
      ExperimentalCommands: is_dev,
      QueueMessage: false,
      DisableLogMatchesOption: false,
      MultipleTeamsPlayers: false,
    }
  }
}
