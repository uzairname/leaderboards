import { Match, MatchPlayer, MatchStatus, PartialPlayer, PartialRanking, Rating } from '@repo/db/models'
import { AnyDeferredContext } from '@repo/discord'
import { sentry } from '../../../logging/sentry'
import { App } from '../../../setup/app'
import { updatePlayerRatings } from '../../players/manage'
import { getScorerFn } from './scorers'

/**
 * Returns the new player ratings based on the match's outcome and rating settings.
 * If the match is not finished, returns undefined.
 */
export async function scoreMatch({
  match_players,
  match,
}: {
  match_players: MatchPlayer[][]
  match: Match
}): Promise<Rating[][] | undefined> {
  // Determine whether the match had an effect on any player ratings
  if (!match.data.outcome || match.data.status !== MatchStatus.Finished) return
  const ranking = await match.ranking.fetch()

  const scorer = getScorerFn(ranking.data.rating_settings.rating_strategy)
  const new_ratings = scorer({
    outcome: match.data.outcome,
    match_players,
    best_of: match.data.metadata?.best_of,
    rating_settings: ranking.data.rating_settings,
  })

  return new_ratings
}

export async function rescoreAllMatches(app: App, p_ranking: PartialRanking, ctx?: AnyDeferredContext) {
  const ranking = await p_ranking.fetch()
  const affected_ratings = new Map<number, Rating>()

  const players = await ranking.players()
  players.forEach(p => affected_ratings.set(p.data.id, ranking.data.rating_settings.initial_rating))

  return await rescoreMatches(app, ranking, { affected_ratings, reset_rating_to_initial: true, ctx })
}

/**
 * Recalculate ratings in the ranking based on all matches after the specified date, using the ranking's scorer.
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
    affected_ratings = new Map(),
    reset_rating_to_initial,
    ctx,
  }: {
    finished_on_or_after?: Date | null
    affected_ratings?: Readonly<Map<number, Rating>>
    reset_rating_to_initial?: boolean
    ctx?: AnyDeferredContext
  } = {},
) {
  // const msg = await ctx?.followup({ content: `Recalculating ratings, and updating matches, players, and leaderboard. Please wait...`, flags: D.MessageFlags.Ephemeral})

  const ranking = await p_ranking.fetch()

  const matches = await app.db.matches.getMany({
    ranking_ids: [ranking.data.id],
    finished_at_or_after: finished_on_or_after,
  })

  sentry.debug(`rescoreMatches(${ranking}, on_or_after ${finished_on_or_after}). rescoring ${matches.length} matches`)

  // List of match players that need to be updated. Indicates ratings for each player before each match
  const match_players_update: { match_id: number; update: MatchPlayer }[] = []

  for (const match of matches) {
    const match_players: MatchPlayer[][] = match.team_players.map(team =>
      team.map(mp => {
        /*
      Determine player ratings before the match.
      If their rating was recalculated, use that.
      If not, reset them if specified, otherwise leave them as they were before.
      */
        const rating_before =
          affected_ratings.get(mp.player.data.id) ??
          (reset_rating_to_initial ? ranking.data.rating_settings.initial_rating : mp.rating)

        const new_match_player = { ...mp, rating: rating_before }
        match_players_update.push({ match_id: match.match.data.id, update: new_match_player })
        affected_ratings.set(mp.player.data.id, rating_before)
        return new_match_player
      }),
    )

    // Recalculate the player ratings
    const new_ratings = await scoreMatch({
      match: match.match,
      match_players,
    })

    if (!new_ratings) continue

    // Update recalculated_player_ratings
    new_ratings.forEach((team, i) =>
      team.forEach((recalculated_rating, j) => {
        const player_id = match_players[i][j].player.data.id
        affected_ratings.set(player_id, recalculated_rating)
      }),
    )
  }

  await app.db.matches.updateMatchPlayers(match_players_update)

  const new_player_ratings: { player: PartialPlayer; rating: Rating }[] = []
  for (const [player_id, rating] of affected_ratings) {
    new_player_ratings.push({ player: app.db.players.get(player_id), rating })
  }

  // update all players' ratings
  await updatePlayerRatings(app, ranking, new_player_ratings)

  return new_player_ratings
}
