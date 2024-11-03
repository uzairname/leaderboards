import { Match, Player } from '../../../../../database/models'
import {
  MatchMetadata,
  MatchPlayer,
  MatchStatus,
  Vote,
} from '../../../../../database/models/matches'
import { PartialPlayer, PlayerFlags } from '../../../../../database/models/players'
import { PartialRanking } from '../../../../../database/models/rankings'
import { sentry } from '../../../../../logging/sentry'
import { App } from '../../../../app/App'
import { UserError, UserErrors } from '../../../errors/UserError'
import { validateMatchData } from './score-matches'
import { rescoreMatches } from './score-matches'

/**
 * Starts a new match, using the players' current ratings
 */
export async function startNewMatch(
  app: App,
  ranking: PartialRanking,
  players: Player[][],
  metadata?: MatchMetadata,
): Promise<Match> {
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
    ranking,
  )

  await ensurePlayersEnabled(
    app,
    match_players.flat().map(p => p.player),
    ranking,
  )

  // shuffle teams
  const shuffled_team_players = match_players.sort(() => Math.random() - 0.5)

  const match = await app.db.matches.create({
    ranking,
    team_players: shuffled_team_players,
    team_votes: match_players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
    metadata,
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
    ranking,
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

export async function ensureNoActiveMatches(
  app: App,
  players: PartialPlayer[],
  ranking: PartialRanking,
): Promise<void> {
  sentry.debug(`ensureNoActiveMatches: players ${players} in ranking ${ranking}`)
  // check if players are already in an active match
  const active_matches = await app.db.matches.getMany({
    players: players,
    rankings: [ranking],
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

export async function ensurePlayersEnabled(
  app: App,
  players: Player[],
  p_ranking: PartialRanking,
): Promise<void> {
  const ranking = await p_ranking.fetch()
  sentry.debug(`ensurePlayersEnabled: players ${players} in ranking ${ranking}`)
  const disabled_players = players.filter(p => p.data.flags & PlayerFlags.Disabled)
  if (disabled_players.length > 0) {
    throw new UserError(
      disabled_players.map(p => `<@${p.data.user_id}>`).join(', ') +
        ` cannot participate in ${ranking.data.name}`,
    )
  }
}
