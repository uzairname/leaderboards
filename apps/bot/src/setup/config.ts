import { RatingStrategy } from '@repo/db/models'
import * as D from 'discord-api-types/v10'
import { Env } from '../Env'
import { getScorerFn } from '../services/matches/scoring/scorers'

export class Config {
  readonly OauthRoutes = {
    Redirect: '/redirect',
    LinkedRoles: '/linkedroles',
    BotAndRoleConnections: '/auth',
    Bot: '/invite',
    Identify: '/login',
  }

  readonly SupportServerInvite = `https://dsc.gg/leaderboard`

  readonly GithubUrl = `https://github.com/uzairname/leaderboards`

  readonly DevGuildId = '1041458052055978024'

  readonly OwnerIds = ['991398096565182467', '375438205253713933']

  readonly RequiredBotPermissions =
    D.PermissionFlagsBits.ManageChannels |
    D.PermissionFlagsBits.ManageMessages |
    D.PermissionFlagsBits.ManageThreads |
    D.PermissionFlagsBits.ManageRoles

  /**
   * Configuration class for the bot application.
   * @param DirectResponse - Return a value directly for interactions
   * @param ProvisionalRdThreshold - Players with a rating deviatino below this will be hidden.
   * @param defaultScorer - The default scoring function.
   * @param RematchTimeoutMinutes - The default amount of time players have to vote for a rematch.
   * @param ChallengeTimeoutMs - The default amount of time a user has to accept a challenge.
   * @param QueueJoinTimeoutMs - The default amount of time before a user is removed from the queue.
   */
  constructor(
    readonly env: Env,
    readonly OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect,
    readonly OauthRoleConnectionsUrl = env.BASE_URL + `/oauth` + this.OauthRoutes.LinkedRoles,
    readonly oauthInviteAndRoleConnectionsUrl = env.BASE_URL + `/oauth` + this.OauthRoutes.BotAndRoleConnections,
    // readonly WebDashboardURL = env.BASE_URL + `/dashboard`,
    readonly IsDev = env.ENVIRONMENT === 'development',
    readonly DirectResponse = IsDev ? false : true,
    readonly features = {
      GiveBotInvite: !IsDev,
      HelpReference: IsDev,
      ExperimentalCommands: IsDev,
      QueueMessage: false,
      DisableLogMatchesOption: false,
      AllowNon1v1: false,
      RatingRoleConnections: false,
      WebDashboardEnabled: false,
    },
    readonly ProvisionalRdThreshold = IsDev ? 0.85 : 0.95,
    readonly DisplayMeanRating = IsDev ? 1000 : 1000,
    readonly DisplaySdOffset = IsDev ? -0.6 : -0.6,
    readonly defaultScorer = getScorerFn(RatingStrategy.TrueSkill),
    readonly RematchTimeoutMinutes = 30,
    readonly ChallengeTimeoutMs = 1000 * 60 * 10,
    readonly QueueJoinTimeoutMs = IsDev ? 1000 * 60 * 0.2 : 1000 * 60 * 20,
  ) {}
}
