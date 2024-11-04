import { Match } from '../../../../../database/models'
import { MatchInsert, MatchMetadata, MatchPlayer, MatchStatus } from '../../../../../database/models/matches'
import { PartialPlayer, PlayerUpdate } from '../../../../../database/models/players'
import { PartialRanking, Rating } from '../../../../../database/models/rankings'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { UserError } from '../../../errors/UserError'
import { syncRankingLbMessages } from '../../leaderboard/leaderboard-message'
import { updatePlayerRatings } from '../../players/manage-players'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { rateTrueskill, Scorer } from './rating-calculation'

// The match scoring service




/**
 * Updates a match's outcome and recalculates player ratings. Sets its status to finished.
 * If it wasn't finished yet, sets time finished to now.
 */
export async function updateMatchOutcome(
  app: App,
  match: Match,
  outcome: number[],
  {
    metadata,
    check_rescore,
  }: {
    metadata?: MatchMetadata | null
    check_rescore?: boolean
  } = {},
) {
  sentry.debug(`updateMatchOutcome: ${match} outcome ${outcome}`)

  validateMatchData({
    ...match.data,
    outcome,
    metadata,
  })

  match = await match.update({
    time_finished: match.data.time_finished ?? new Date(),
    status: MatchStatus.Finished,
    outcome,
    metadata,
  })

  await rescoreMatches(app, match.ranking, { finished_on_or_after: match.data.time_finished })
  await syncMatchSummaryMessages(app, match)
}


/**
 * Cancels a match that hasn't been finished. Sets the time finished to now and status to canceled.
 */
export async function cancelMatch(app: App, match: Match): Promise<void> {
  sentry.debug(`cancelMatch: ${match}`)
  if (match.data.status === MatchStatus.Finished) return

  await match.update({
    status: MatchStatus.Canceled,
    time_finished: new Date(),
  })

  const thread_id = match.data.ongoing_match_channel_id
  if (thread_id) {
    await app.discord.editChannel(thread_id, {
      archived: true,
    })
  }

  await syncMatchSummaryMessages(app, match)
}


/**
 * Reverts a finished match and reverses its effects on rankings. Sets its status to canceled.
 */
export async function revertMatch(app: App, match: Match): Promise<void> {
  // Set status to canceled
  await match.update({
    status: MatchStatus.Canceled,
  })

  // Get the player ratings before the match. Use these as a starting point to recalculate rankings
  const affected_player_ratings: Map<number, Rating> = new Map()
  const players = await match.players()
  players.flat().forEach(p => {
    affected_player_ratings.set(p.player.data.id, p.player.data.rating)
  })

  // Score ranking history with this match canceled
  await rescoreMatches(app, match.ranking, {
    finished_on_or_after: match.data.time_finished ?? undefined,
    affected_ratings: affected_player_ratings,
  })

  // update summary messages
  const guild_rankings = await app.db.guild_rankings.fetch({ ranking_id: match.data.ranking_id })
  await Promise.all(
    guild_rankings.map(async (guild_ranking) => {
      const summary_message = await match.getSummaryMessage(guild_ranking.guild.data.id)
      await app.discord.deleteMessageIfExists(
        guild_ranking.guild.data.matches_channel_id,
        summary_message?.message_id
      )
    })
  )
}

/**
 * Recalculate ratings in the ranking based on all matches after the specified date.
 * @param affected_ratings A map of player IDs to their ratings before any of these matches were scored
 *  The running recalculation of player ratings.
 *  This object is updated as matches are processed
 *  Ends up being the updated player ratings after the latest match
 * @param reset_rating_to_initial If provided, all players not in affected_ratings will be reset to the initial rating.
 */
export async function rescoreMatches(
  app: App,
  p_ranking: PartialRanking,
  {
    finished_on_or_after,
    affected_ratings: running_player_ratings = new Map(),
    reset_rating_to_initial,
    scorer = rateTrueskill,
  }: {
    finished_on_or_after?: Date | null
    affected_ratings?: Readonly<Map<number, Rating>>
    reset_rating_to_initial?: boolean
    scorer?: Scorer
  } = {},
) {
  const ranking = await p_ranking.fetch()

  const matches = await app.db.matches.getMany({
    rankings: [ranking],
    finished_at_or_after: finished_on_or_after,
  })

  sentry.debug(
    `rescoreMatches(${ranking}, on_or_after ${finished_on_or_after}). rescoring ${matches.length} matches`,
  )

  // List of match players that need to be updated. Indicates ratings for each player before each match
  const new_match_players: { match_id: number; player: MatchPlayer }[] = []

  for (const match of matches) {
    const match_players: MatchPlayer[][] = match.team_players.map(team =>
      team.map(mp => {
        /* 
        Determine player ratings before the match. 
        If their rating was recalculated, use that.
        If not, reset them if specified, otherwise leave them as they were before.
        */
        const player_id = mp.player.data.id
        const new_rating = running_player_ratings.get(player_id) 
          ?? (reset_rating_to_initial 
            ? ranking.data.initial_rating
            : mp.rating)
            
        const new_match_player = { ...mp, rating: new_rating }
        new_match_players.push({ match_id: match.match.data.id, player: new_match_player })
        running_player_ratings.set(player_id, new_rating)
        return new_match_player
      }),
    )

    // Determine whether the match had an effect on any player ratings
    if (!match.match.data.outcome) continue

    // Recalculate the player ratings
    const new_ratings = scorer(
      match.match.data.outcome,
      match_players,
      ranking.data.initial_rating,
      match.match.data.metadata?.best_of,
    )

    // Update recalculated_player_ratings
    new_ratings.forEach((team, i) =>
      team.forEach((recalculated_rating, j) => {
        const player_id = match.team_players[i][j].player.data.id
        running_player_ratings.set(player_id, recalculated_rating)
      }),
    )
  }

  await app.db.matches.updateMatchPlayers(new_match_players)

  const new_players: { player: PartialPlayer; rating: Rating }[] = []
  for (const [player_id, rating] of running_player_ratings) {
    new_players.push({player: app.db.players.get(player_id), rating })
  }

  // update all players' ratings
  await updatePlayerRatings(app, new_players)
} 



export function validateMatchData(o: Partial<{ players: MatchPlayer[][]}  & MatchInsert>): void {
  if (o.outcome) {
    if (o.players) {
      if (o.outcome.length !== o.players.length)
        throw new Error(`Match outcome and players length must match`)
    }
  }

  if (o.players) {
    const team_player_ids = o.players.map(team => team.map(p => p.player.data.id))
    if (team_player_ids.flat().length !== new Set(team_player_ids.flat()).size)
      throw new UserError(`Duplicate players in a match`)
    if (new Set(o.players.flat().map(p => p.player.data.ranking_id)).size !== 1)
      throw new UserError(`Players must be from the same ranking`)
  }
}

