import * as D from 'discord-api-types/v10'
import { Env } from '../../Env'
import { rateTrueskill } from '../services/matches/management/rating-calculation'

export class Config {
  readonly OauthRoutes = {
    Redirect: '/redirect',
    LinkedRoles: '/linkedroles',
    BotAndRoleConnections: '/auth',
    Bot: '/invite',
    Identify: '/login',
  }

  readonly DevGuildId = '1041458052055978024'

  readonly OwnerIds = ['991398096565182467', '375438205253713933']

  readonly RequiredBotPermissions =
    D.PermissionFlagsBits.ManageChannels |
    D.PermissionFlagsBits.ManageMessages |
    D.PermissionFlagsBits.ManageThreads |
    D.PermissionFlagsBits.ManageRoles

  constructor(
    readonly env: Env,

    readonly OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect,

    readonly WebDashboardURL = env.BASE_URL + `/dashboard`,

    readonly IsDev = env.ENVIRONMENT === 'development',

    readonly DirectResponse = IsDev ? true : true,
    // true: Return a value directly.
    // false: Rall respond endpoint. Requests will get canceled. Will log interaction response errors in sentry.

    readonly features = {
      GiveBotInvite: !IsDev,
      HelpReference: IsDev,
      ExperimentalCommands: IsDev,
      QueueMessage: false,
      DisableLogMatchesOption: false,
      AllowNon1v1: false,
      RatingRoleConnections: false,
      WebDashboardEnabled: IsDev,
    },

    readonly ProvisionalRdThreshold = IsDev ? 0.85 : 0.85,

    readonly DisplayMeanRating = IsDev ? 1000 : 1000,
    readonly DisplaySdOffset = IsDev ? -0.6 : -0.6,

    readonly defaultScorer = rateTrueskill,

    readonly RematchTimeoutMinutes = 30,

    readonly ChallengeTimeoutMs = 1000 * 60 * 10,

    readonly QueueJoinTimeoutMs = IsDev ? 1000 * 60 * 0.2 : 1000 * 60 * 20,
  ) {}
}
