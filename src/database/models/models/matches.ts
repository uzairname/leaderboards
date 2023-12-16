import { and, eq } from 'drizzle-orm'
import { nonNullable } from '../../../utils/utils'

import { MatchPlayers, Matches, Players } from '../../schema'
import { DbErrors } from '../../errors'

import { DbObject, DbObjectManager } from '../managers'
import { Player } from '..'
import { MatchInsert, MatchPlayerSelect, MatchSelect, MatchUpdate } from '../../types'
import { unflatten } from '../../../utils/utils'

export class Match extends DbObject<MatchSelect> {
  async players(): Promise<{ player: Player; match_player: MatchPlayerSelect }[][]> {
    const players = await this.db.db
      .select({ player: Players, match_player: MatchPlayers })
      .from(MatchPlayers)
      .where(eq(MatchPlayers.match_id, this.data.id))
      .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))

    const player_teams = Array.from(
      { length: nonNullable(this.data.team_players).length },
      () => [] as { player: Player; match_player: MatchPlayerSelect }[],
    )

    players.forEach((player) => {
      player_teams[nonNullable(player.match_player.team_num, 'match_player.team_num')].push({
        player: new Player(player.player, this.db),
        match_player: player.match_player,
      })
    })

    return player_teams
  }

  async update(
    data: { team_players_before: { id: number; rating: number; rd: number }[][] } & Omit<
      MatchUpdate,
      'team_players' | 'number'
    >,
  ) {
    await this.db.db
      .update(Matches)
      .set({
        ...data,
        team_players: data.team_players_before.map((team) => team.map((player) => player.id)),
      })
      .where(eq(Matches.id, this.data.id))

    const match_players_new = data.team_players_before
      .flat()
      .map((player) => {
        return {
          match_id: this.data.id,
          player_id: player.id,
          rating_before: player.rating,
          rd_before: player.rd,
        }
      })
      .flat()

    // update all match players' ratings and rd before
    await Promise.all(
      match_players_new.map(async (new_mp) => {
        await this.db.db
          .update(MatchPlayers)
          .set(new_mp)
          .where(
            and(
              eq(MatchPlayers.match_id, new_mp.match_id),
              eq(MatchPlayers.player_id, new_mp.player_id),
            ),
          )
      }),
    )
  }
}

export class MatchesManager extends DbObjectManager {
  async create(
    data: { team_players: Player[][] } & Omit<MatchInsert, 'team_players'>,
  ): Promise<Match> {
    this.validateNewMatch(data)

    let new_match_data = (
      await this.db.db
        .insert(Matches)
        .values({
          ...data,
          team_players: data.team_players.map((team) => team.map((player) => player.data.id)),
        })
        .returning()
    )[0]

    let match_players = data.team_players
      .map((team, team_num) => {
        return team.map((player) => {
          return {
            match_id: new_match_data.id,
            player_id: player.data.id,
            team_num,
            rating_before: player.data.rating,
            rd_before: player.data.rd,
          }
        })
      })
      .flat()

    const new_match_players = await this.db.db
      .insert(MatchPlayers)
      .values(match_players)
      .returning()

    // TODO: cache this
    const new_match_team_players_ordered = unflatten(
      new_match_players.sort(
        (a, b) => nonNullable(a.team_num, 'team_num') - nonNullable(b.team_num, 'team_num'),
      ),
      data.team_players[0].length,
    )

    const new_match = new Match(new_match_data, this.db)

    return new_match
  }

  private validateNewMatch(data: { team_players: Player[][] } & Omit<MatchInsert, 'team_players'>) {
    if (data.team_players && data.outcome) {
      if (data.team_players.length !== data.outcome.length) {
        throw new DbErrors.ValidationError(`team_players and outcome length don't match`)
      }
      // make sure all players are from the same ranking, and no duplicate player ids
      if (
        data.team_players.flat().length !==
        new Set(data.team_players.flat().map((p) => p.data.id)).size
      ) {
        throw new DbErrors.ValidationError('Duplicate players in one match')
      }
      if (
        data.team_players.some((team) =>
          team.some((player) => player.data.ranking_id !== data.ranking_id),
        )
      ) {
        throw new DbErrors.ValidationError(
          `Some players not in the match's ranking (${data.ranking_id})`,
        )
      }
    } else {
      throw new DbErrors.ValidationError('team_players or outcome undefined')
    }
  }
}
