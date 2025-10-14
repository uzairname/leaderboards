import {
  Guild,
  Match,
  MatchMetadata,
  MatchOutcome,
  MatchPlayer,
  MatchStatus,
  OutcomeType,
  PartialPlayer,
  PartialRanking,
  Player,
  PlayerFlags,
  Rating,
} from '@repo/db/models'
import { MessageData } from '@repo/discord'
import { maxIndex, nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError, UserErrors } from '../../errors/user-errors'
import { matchSummaryEmbed } from '../../interactions/view-matches/view'
import { App, offload } from '../../setup/app'
import { ensureGuildAdminPerms, GuildAuth } from '../perms'
import { displayRatingFn } from '../rankings/ratings'
import { AppService, LogMethods } from '../service'
import { syncMatchesChannel } from './logging/matches-channel'
import { OngoingMatchService } from './ongoing-match/ongoing-match-service'

/**
 * Info about a player in a match to display
 */
export type MatchPlayerDisplay = {
  player: Player
  before: { points: number; is_provisional?: boolean }
  after?: { points: number; is_provisional?: boolean }
}

@LogMethods
export class MatchesService extends AppService {
  public ongoing: OngoingMatchService
  constructor(...args: ConstructorParameters<typeof AppService>) {
    super(...args)
    this.ongoing = new OngoingMatchService(...args)
  }

  /**
   * Starts a new match, using the players' current ratings
   */
  async start(app: App, p_ranking: PartialRanking, players: Player[][], best_of?: number) {
    // Checks
    this.validateMatchData({ players })
    await this.ensurePlayersCanStartMatch(app, players.flat())

    // shuffle teams
    const shuffled_team_players = players.sort(() => Math.random() - 0.5)

    const ranking = await p_ranking.fetch()

    // This is a new match, so set their ratings to their current ratings
    const match_players = await Promise.all(
      shuffled_team_players.map(
        async team =>
          await Promise.all(
            team.map(async p => {
              return {
                player: p,
                rating: p.data.rating,
                // time_since_last_match: (await app.players.getInfoAtTime(app, p, new Date())).seconds,
                flags: p.data.flags ?? PlayerFlags.None,
              }
            }),
          ),
      ),
    )

    const match = await app.db.matches.create({
      ranking,
      match_players,
      status: MatchStatus.Ongoing,
      metadata: {
        best_of: best_of ?? app.rankings.getProperties(ranking).matchmaking_settings.default_best_of,
      },
    })

    return match
  }

  /**
   * Creates a new finished match, and scores it based on the specified players ratings.
   * It could have taken place in the past.
   * @param players players and their ratings before the match
   * @param time_started The time when the match started. If not provided, uses the current time.
   * @param time_finished The time when the match finished. If not provided, uses the current time.
   */
  async createFinished({
    app,
    ranking,
    players,
    outcome,
    time_started,
    time_finished,
    metadata,
  }: {
    app: App
    ranking: PartialRanking
    players: Player[][]
    outcome: MatchOutcome
    time_started?: Date
    time_finished?: Date
    metadata?: MatchMetadata
  }): Promise<Match> {
    this.validateMatchData({
      players,
      outcome,
    })

    await this.ensurePlayersEnabled(players.flat())

    const match_time_started = time_started ?? time_finished ?? new Date()
    const match_time_finished = time_finished ?? match_time_started

    // Determine if the match finished in the past (more than 1 second ago)
    const finished_in_past = match_time_finished && match_time_finished.getTime() < new Date().getTime() - 1000

    const match_players: MatchPlayer[][] = await Promise.all(
      players.map(async team => {
        return Promise.all(
          team.map(async p => {
            // If the match just finished, use current player ratings to save queries
            const res = finished_in_past ? await app.players.getInfoAtTime(app, p, match_time_started) : undefined

            app.logger.debug(`.. finished_in_past: ${finished_in_past}, time_started: ${time_started}, res: ${res}`)

            return {
              player: p,
              rating: res?.rating ?? p.data.rating,
              time_since_last_match: res?.seconds,
              // Use the player's flags at time of insertion (may not be fully accurate, but ok), or default to None
              flags: p.data.flags ?? PlayerFlags.None,
            }
          }),
        )
      }),
    )

    const match = await app.db.matches.create({
      ranking,
      match_players,
      outcome,
      metadata,
      time_started: match_time_started,
      time_finished: match_time_finished,
      status: MatchStatus.Finished,
    })

    offload(
      app,
      async app => {
        await app.scoring.rescoreMatches(app, match.ranking, { finished_on_or_after: match.data.time_finished })
        await this.syncMatchSummaryMessages(app, match)
      },
      'after-match-create',
    )

    return match
  }

  /**
   * Utility function to set the match outcome based on winner's user id, role, or name
   * If the match's current outcome type is something other than WinLossDraw, it will be overwritten.
   * @param player A player from the winning team
   */
  async setWinner(app: App, match: Match, player: Player, auth: GuildAuth) {
    await ensureGuildAdminPerms(app, auth)
    const team_players = await match.teams()
    const team_index = team_players.findIndex(team => team.some(p => p.player.data.id === player.data.id))
    if (team_index == -1) throw new UserError(`${app.players.mentionOrName(player)} isn't participating in this match`)
    const team_scores = team_players.map((_, i) => (i === team_index ? 1 : 0))
    const outcome: MatchOutcome = { type: OutcomeType.WinLossDraw, team_scores }
    await this.setOutcome(app, match, auth, outcome)
  }

  /**
   * Sets the match outcome to a draw (all teams have the same score)
   * If the match's current outcome type is something other than WinLossDraw, it will be overwritten.
   */
  async setMatchDraw(app: App, match: Match, auth: GuildAuth) {
    await ensureGuildAdminPerms(app, auth)
    const team_players = await match.teams()
    const outcome: MatchOutcome = { type: OutcomeType.WinLossDraw, team_scores: team_players.map(() => 0.5) }
    await this.setOutcome(app, match, auth, outcome)
  }

  /**
   * Sets the time finished to now and the status to canceled.
   * Archives the ongoing match channel, if it exists.
   * @param auth Information about the user who is performing the current action. If the
   * match players voted to cancel, pass 'vote'
   */
  async cancel(app: App, match: Match, auth: GuildAuth | 'vote'): Promise<Match> {
    auth !== 'vote' && (await ensureGuildAdminPerms(app, auth))

    const updated_match = await match.update({
      status: MatchStatus.Canceled,
      time_finished: new Date(),
    })

    offload(
      app,
      async app => {
        // Archive the ongoing match thread and update the message
        const thread_id = match.data.ongoing_match_channel_id
        if (thread_id) {
          await app.discord.editChannel(thread_id, {
            archived: true,
          })
        }
        // Score ranking history with this match canceled,

        // Get the player ratings from before the match. We need to use these as
        // a starting point to recalculate rankings because the scorer does not
        // score canceled matches and will use the ratings from the next match they played
        const affected_player_ratings: Map<number, Rating> = new Map()
        const players = await match.teams()
        players.flat().forEach(p => {
          affected_player_ratings.set(p.player.data.id, p.player.data.rating)
        })

        await app.scoring.rescoreMatches(app, match.ranking, {
          finished_on_or_after: match.data.time_finished,
          affected_ratings: affected_player_ratings,
        })

        // update the match summary messages
        await this.syncMatchSummaryMessages(app, match)
      },
      'after-match-cancel',
    )

    return updated_match
  }

  /**
   * Updates a match's outcome and recalculates player ratings. Sets its status to finished.
   * If it wasn't finished yet, sets time finished to now.
   */
  async setOutcome(
    app: App,
    match: Match,
    auth: GuildAuth | 'vote',
    outcome: MatchOutcome,
    {
      metadata,
    }: {
      metadata?: MatchMetadata | null
    } = {},
  ) {
    auth !== 'vote' && (await ensureGuildAdminPerms(app, auth))

    this.validateMatchData({
      ...match.data,
      outcome,
    })

    match = await match.update({
      time_finished: match.data.time_finished ?? new Date(),
      status: MatchStatus.Finished,
      outcome,
      metadata,
    })

    offload(
      app,
      async app => {
        await app.scoring.rescoreMatches(app, match.ranking, { finished_on_or_after: match.data.time_finished })
        await this.syncMatchSummaryMessages(app, match)
      },
      'after-match-setoutcome',
    )
  }

  /**
   * Sync match summary messages for this match across all guilds the match's ranking is in
   */
  private async syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
    const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: match.data.ranking_id })
    await Promise.all(
      guild_rankings.map(async item => {
        await this.syncMatchSummaryMessage(app, match, item.guild)
      }),
    )
  }

  /**
   * Updates the match's summary message, according to the guild ranking's settings. Creates it if it doesn't exist
   */
  async syncMatchSummaryMessage(app: App, match: Match, guild: Guild): Promise<D.APIMessage> {
    // Check whether match logging is enabled for this guild ranking

    const summary_message = await match.summaryMessage(guild.data.id)

    const sync_message_result = await app.discord.utils.syncChannelMessage({
      target_channel_id: guild.data.matches_channel_id,
      target_message_id: summary_message?.message_id,
      messageData: () => this.matchSummaryMessageData(app, match),
      getChannel: () => syncMatchesChannel(app, guild, true),
    })

    if (sync_message_result.is_new_message) {
      await match.updateSummaryMessage(guild.data.id, sync_message_result.channel_id, sync_message_result.message.id)
    }

    return sync_message_result.message
  }

  private async matchSummaryMessageData(app: App, match: Match): Promise<MessageData> {
    return new MessageData({
      embeds: [await matchSummaryEmbed(app, match)],
    })
  }

  /**
   * Runs all checks to ensure that the players are alowed to start a match.
   * Throws a UserError if any of the checks fail.
   */
  async ensurePlayersCanStartMatch(app: App, players: Player[]) {
    await Promise.all([this.ensureNoActiveMatches(app, players), this.ensurePlayersEnabled(players)])
  }

  /**
   * Ensures that the players are not already in an active match.
   */
  async ensureNoActiveMatches(app: App, players: PartialPlayer[]): Promise<void> {
    // check if players are already in an active match
    const active_matches = await app.db.matches.getMany({
      player_ids: players.map(p => p.data.id),
      status: MatchStatus.Ongoing,
    })

    if (active_matches.length > 0) {
      throw new UserErrors.OngoingMatchEror(
        `Finish the following match${active_matches.length === 1 ? `` : `es`} before starting a new one:` +
          `\n` +
          (
            await Promise.all(
              active_matches.map(async m => {
                return (
                  `\`${m.match.data.id}\`` +
                  (m.match.data.ongoing_match_channel_id ? `: <#${m.match.data.ongoing_match_channel_id}>` : ``)
                )
              }),
            )
          ).join(`\n`),
      )
    }
  }

  /**
   * Ensures that all players are enabled in order to start a match with them
   */
  async ensurePlayersEnabled(players: Player[]): Promise<void> {
    const disabled_players = players.filter(p => p.data.flags & PlayerFlags.Disabled)
    if (disabled_players.length > 0) {
      throw new UserErrors.PlayersDisabled(disabled_players)
    }
  }

  /**
   * Ensures that all players are in the same ranking,  teams have consistent sizes, and no duplicate players.
   * Throws an error if the match data is invalid.
   */
  validateMatchData(o: { players?: Player[][]; outcome?: MatchOutcome | null }): void {
    if (o.outcome) {
      if (o.players) {
        if (o.outcome?.team_scores) {
          if (o.outcome.team_scores.length !== o.players.length)
            throw new Error(`Match outcome team_scores.length and number of teams must match`)
        }
      }
    }

    if (o.players) {
      const team_player_ids = o.players.map(team => team.map(p => p.data.id))
      if (team_player_ids.flat().length !== new Set(team_player_ids.flat()).size)
        throw new UserError(`Cannot have duplicate players in a match`)
      if (new Set(o.players.flat().map(p => p.data.ranking_id)).size !== 1)
        throw new UserError(`Players must be from the same ranking`)
    }
  }

  /**
   * Source of truth for the winning team indices based on the outcome
   * and whether a match is a draw
   */
  getOutcomeWinners(outcome: MatchOutcome) {
    // The scores used to determine wins. Higher=better
    const scores = (() => {
      if (outcome.type === OutcomeType.WinLossDraw) {
        return nonNullable(outcome.team_scores)
      } else if (outcome.type === OutcomeType.Points) {
        return nonNullable(outcome.team_scores)
      } else if (outcome.type === OutcomeType.Ranks) {
        // In Ranks, lower rank is better, so invert the scores
        return nonNullable(outcome.team_scores).map(rank => 1 - rank)
      } else {
        throw new Error(`Invalid match outcome type: ${outcome.type}`)
      }
    })()

    const winning_teams = maxIndex(scores)
    return { winning_team_indices: winning_teams, is_draw: winning_teams.length === scores.length }
  }

  /**
   * Returns the properties of a match
   * @returns
   * - `winning_team_indices`: The indices of the team whose outcome is not less
   *  than any others. Undefined if the match is not finished.
   * - `is_draw`: Whether the match is a full draw, meaning all teams have the same outcome.
   *  Undefined if the match is not finished.
   */
  getProperties(match: Match): {
    winning_team_indices?: number[]
    is_draw?: boolean
  } {
    if (match.data.status !== MatchStatus.Finished || !match.data.outcome) {
      return {}
    }
    return this.getOutcomeWinners(match.data.outcome)
  }

  /**
   * Returns stats for players in a match, including their ratings before and after the match.
   */
  async playerDisplayStats(app: App, match: Match): Promise<MatchPlayerDisplay[][]> {
    const ranking = await match.ranking.fetch()
    const team_players = await match.teams()
    const display = displayRatingFn(app, ranking)

    const new_ratings = app.scoring.scoreMatch({
      app,
      match: match,
      players: team_players,
      rating_settings: ranking.data.rating_settings,
    })

    const result = team_players.map((team, i) =>
      team.map((match_player, j) => {
        return {
          player: match_player.player,
          before: display(match_player.rating),
          after: new_ratings ? display(new_ratings[i][j]) : undefined,
        }
      }),
    )

    return result
  }
}
