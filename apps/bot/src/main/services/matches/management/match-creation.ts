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
} from '@repo/database/models'
import { sentry } from '../../../../logging/sentry'
import { UserErrors } from '../../../errors/UserError'
import { App } from '../../../setup/app'
import { default_best_of } from '../../rankings/manage-rankings'
import { rescoreMatches, validateMatchData } from './manage-matches'

/**
 * Starts a new match, using the players' current ratings
 */
export async function startNewMatch(
  app: App,
  p_ranking: PartialRanking,
  players: Player[][],
  best_of?: number,
): Promise<Match> {
  const ranking = await p_ranking.fetch()

  const match_players = players.map((team, i) =>
    team.map((p, i) => ({
      player: p,
      ...p.data,
    })),
  )

  validateMatchData({ players: match_players })

  await ensureNoActiveMatches(
    app,
    match_players.flat().map(p => p.player),
  )

  await ensurePlayersEnabled(
    app,
    match_players.flat().map(p => p.player),
  )

  // shuffle teams
  const shuffled_team_players = match_players.sort(() => Math.random() - 0.5)

  const match = await app.db.matches.create({
    ranking,
    team_players: shuffled_team_players,
    team_votes: match_players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
    metadata: {
      best_of: best_of ?? ranking.data.matchmaking_settings.default_best_of ?? default_best_of,
    },
  })

  return match
}

/**
 * Creates a new match, and scores it based on the specified players ratings.
 * It could have taken place in the past.
 * @param players players and their ratings before the match
 */
export async function recordAndScoreMatch(
  app: App,
  ranking: PartialRanking,
  players: MatchPlayer[][],
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

  await ensurePlayersEnabled(
    app,
    players.flat().map(p => p.player),
  )

  const match = await app.db.matches.create({
    ranking,
    team_players: players,
    outcome,
    metadata,
    time_started,
    time_finished,
    status: MatchStatus.Finished,
  })

  await rescoreMatches(app, match.ranking, { finished_on_or_after: match.data.time_finished })

  return app.db.matches.fetch(match.data.id)
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
                (m.match.data.ongoing_match_channel_id
                  ? `: <#${m.match.data.ongoing_match_channel_id}>`
                  : ``)
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
