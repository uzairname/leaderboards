import {
  Match,
  MatchMetadata,
  MatchPlayer,
  MatchStatus,
  PartialPlayer,
  PartialRanking,
  Player,
  PlayerFlags,
  Vote,
} from '@repo/db/models'
import { UserErrors } from '../../../errors/user-errors'
import { sentry } from '../../../logging/sentry'
import { App } from '../../../setup/app'
import { getInfoAtTime } from '../../players/properties'
import { rankingProperties } from '../../settings/properties'
import { syncMatchSummaryMessages } from '../logging/match-summary-message'
import { rescoreMatches } from '../scoring/score-matches'
import { validateMatchData } from './update-matches'

/**
 * Starts a new match, using the players' current ratings
 */
export async function startNewMatch(
  app: App,
  p_ranking: PartialRanking,
  players: Player[][],
  best_of?: number,
): Promise<Match> {
  sentry.debug(`startNewMatch: ranking_id=${p_ranking.data.id} players=${players.length}`)

  const ranking = await p_ranking.fetch()

  validateMatchData({ players })

  await ensureNoActiveMatches(app, players.flat())

  await ensurePlayersEnabled(app, players.flat())

  // shuffle teams
  const shuffled_team_players = players.sort(() => Math.random() - 0.5)

  // This is a new match, so set their ratings to their current ratings
  const match_players = await Promise.all(
    shuffled_team_players.map(
      async team =>
        await Promise.all(
          team.map(async p => {
            return {
              player: p,
              rating: p.data.rating,
              time_since_last_match: (await getInfoAtTime(app, p, new Date())).seconds,
              flags: p.data.flags ?? PlayerFlags.None,
            }
          }),
        ),
    ),
  )

  const match = await app.db.matches.create({
    ranking,
    match_players,
    team_votes: players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
    metadata: {
      best_of: best_of ?? rankingProperties(ranking).default_best_of,
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
export async function recordAndScoreMatch(
  app: App,
  ranking: PartialRanking,
  players: Player[][],
  outcome: number[],
  time_started?: Date,
  time_finished?: Date,
  metadata?: MatchMetadata,
): Promise<Match> {
  validateMatchData({
    ranking_id: ranking.data.id,
    players,
    outcome,
    metadata,
    time_started,
    time_finished,
  })

  await ensurePlayersEnabled(app, players.flat())

  const match_time_started = time_started ?? time_finished ?? new Date()
  const match_time_finished = time_finished ?? match_time_started

  // Determine if the match finished in the past (more than 1 second ago)
  const finished_in_past = match_time_finished && match_time_finished.getTime() < new Date().getTime() - 1000

  const match_players: MatchPlayer[][] = await Promise.all(
    players.map(async team => {
      return Promise.all(
        team.map(async p => {
          // If the match just finished, use current player ratings to save queries
          const res = finished_in_past ? await getInfoAtTime(app, p, match_time_started) : undefined

          sentry.debug(`.. finished_in_past: ${finished_in_past}, time_started: ${time_started}, res: ${res}`)

          return {
            player: p,
            rating: res?.rating ?? p.data.rating,
            time_since_last_match: res?.seconds,
            flags: p.data.flags ?? PlayerFlags.None, // Use the player's flags at time of insertion, or default to None
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

  await rescoreMatches(app, match.ranking, { finished_on_or_after: match.data.time_finished })

  await syncMatchSummaryMessages(app, match)

  return match
}

// Ensures that the players are not in an active match in their ranking
export async function ensureNoActiveMatches(app: App, players: PartialPlayer[]): Promise<void> {
  sentry.debug(`ensureNoActiveMatches: players ${players}`)
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

export async function ensurePlayersEnabled(app: App, p_players: PartialPlayer[]): Promise<void> {
  sentry.debug(`ensurePlayersEnabled: players ${p_players}`)
  const players = await Promise.all(p_players.map(p => p.fetch()))
  const disabled_players = players.filter(p => p.data.flags & PlayerFlags.Disabled)
  if (disabled_players.length > 0) {
    throw new UserErrors.PlayersDisabled(disabled_players)
  }
}
