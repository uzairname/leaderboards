import { App } from '../../../../app/App'
import { GuildRanking, Match } from '../../../../../database/models'
import {
  MatchInsert,
  MatchMetadata,
  MatchStatus,
  MatchTeamPlayer,
  Vote,
} from '../../../../../database/models/matches'
import { UserError } from '../../../errors/UserError'
import { scoreRankingHistory } from './score_matches'

export async function startNewMatch(
  app: App,
  guild_ranking: GuildRanking,
  team_players: MatchTeamPlayer[][],
  metadata?: MatchMetadata,
): Promise<Match> {
  validateMatchData({ team_players })

  // check if players are already in an active match
  const player_active_matches = await app.db.matches.getMany({
    player_ids: team_players.flat().map(p => p.player.data.id),
    status: MatchStatus.Ongoing,
  })

  if (player_active_matches.length > 0) {
    throw new UserError(`One or more players are already in an ongoing match`)
  }

  const ranking = await guild_ranking.ranking

  const match = await app.db.matches.create({
    ranking,
    team_players,
    team_votes: team_players.map(_ => Vote.Undecided),
    status: MatchStatus.Ongoing,
    metadata,
  })

  return match
}

export async function updateMatch(
  app: App,
  match: Match,
  outcome?: number[],
  metadata?: MatchMetadata,
) {
  validateMatchData({
    ...match.data,
    outcome,
    metadata,
  })

  await match.update({
    outcome,
    metadata,
  })

  if (outcome) {
    await scoreRankingHistory(app, await match.ranking(), match.data.time_finished ?? undefined)
  }

  await app.events.MatchCreatedOrUpdated.emit(match)
}

export async function deleteMatch(app: App, match: Match): Promise<void> {
  // delete summary messages before deleting match
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })
  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      const summary_message = await match.getSummaryMessage(guild_ranking.guild.data.id)
      await app.bot.utils.deleteMessageIfExists(
        guild_ranking.guild.data.matches_channel_id,
        summary_message?.message_id,
      )
    }),
  )

  // get player ratings before deleting match
  const player_ratings_before = Object.fromEntries(
    (await match.teamPlayers())
      .map(t =>
        t.map(p => [
          p.player.data.id,
          {
            rating: p.rating_before,
            rd: p.rd_before,
          },
        ]),
      )
      .flat(),
  )

  await match.delete()

  // score ranking history without match
  await scoreRankingHistory(
    app,
    await match.ranking(),
    match.data.time_finished ?? undefined,
    player_ratings_before,
  )
}

export function validateMatchData<
  T extends Partial<{ team_players: MatchTeamPlayer[][] } & MatchInsert>,
>(o: T): T {
  if (o.outcome) {
    if (o.team_players) {
      if (o.outcome!.length !== o.team_players!.length)
        throw new UserError(`Match outcome and players length must match`)
    }
  }

  if (o.team_players) {
    const team_player_ids = o.team_players.map(team => team.map(p => p.player.data.id))
    if (team_player_ids.flat().length !== new Set(team_player_ids.flat()).size)
      throw new UserError(`Duplicate players in a match`)
    if (new Set(o.team_players.flat().map(p => p.player.data.ranking_id)).size !== 1)
      throw new UserError(`Players must be from the same ranking`)
  }
  return o
}
