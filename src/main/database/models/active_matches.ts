// import { InferInsertModel, InferSelectModel, eq } from 'drizzle-orm'
// import { Player, Ranking } from '.'
// import { DbClient } from '../client'
// import { DbErrors } from '../errors'
// import { DbObject, DbObjectManager } from '../managers'
// import { ActiveMatches } from '../schema'

// export type ActiveMatchSelect = InferSelectModel<typeof ActiveMatches>
// export type ActiveMatchInsert = Omit<InferInsertModel<typeof ActiveMatches>, 'id'>
// export type ActiveMatchUpdate = Partial<Omit<ActiveMatchInsert, 'ranking_id' | 'team_players'>>

// export class ActiveMatch extends DbObject<ActiveMatchSelect> {
//   constructor(data: ActiveMatchSelect, db: DbClient) {
//     super(data, db)
//     db.cache.active_matches[data.id] = this
//   }

//   async ranking(): Promise<Ranking> {
//     return this.db.rankings.get(this.data.ranking_id)
//   }

//   async teamPlayers(): Promise<Player[][]> {
//     if (this.db.cache.active_match_team_players[this.data.id]) {
//       return this.db.cache.active_match_team_players[this.data.id]
//     }

//     if (!this.data.team_players) {
//       return []
//     }

//     const team_player_ids = this.data.team_players

//     const team_players = await Promise.all(
//       team_player_ids.map(team =>
//         Promise.all(team.map(player_id => this.db.players.getById(player_id))),
//       ),
//     )

//     this.db.cache.active_match_team_players[this.data.id] = team_players

//     return team_players
//   }

//   async update(data: ActiveMatchUpdate) {}

//   async delete(): Promise<void> {
//     await this.db.db.delete(ActiveMatches).where(eq(ActiveMatches.id, this.data.id))
//     delete this.db.cache.active_matches[this.data.id]
//   }
// }

// export class ActiveMatchesManager extends DbObjectManager {
//   async create(
//     data: { team_players: Player[][]; ranking: Ranking } & Omit<
//       ActiveMatchInsert,
//       'team_players' | 'ranking_id'
//     >,
//   ): Promise<ActiveMatch> {
//     const new_active_match_data = (
//       await this.db.db
//         .insert(ActiveMatches)
//         .values({
//           ...data,
//           team_players: data.team_players.map(team => team.map(player => player.data.id)),
//           ranking_id: data.ranking.data.id,
//         })
//         .returning()
//     )[0]

//     const new_active_match = new ActiveMatch(new_active_match_data, this.db)

//     return new_active_match
//   }

//   async get(id: number): Promise<ActiveMatch> {
//     if (this.db.cache.active_matches[id]) {
//       return this.db.cache.active_matches[id]
//     }

//     const data = (await this.db.db.select().from(ActiveMatches).where(eq(ActiveMatches.id, id)))[0]

//     if (!data) {
//       throw new DbErrors.NotFoundError(`ActiveMatch ${id} doesn't exist`)
//     }

//     return new ActiveMatch(data, this.db)
//   }

//   async findByPlayers(player_ids: Player[]): Promise<ActiveMatch[]> {
//     // finds active matches where the player is in the team_players array

//     const ranking_id = player_ids[0].data.ranking_id

//     const active_matches_in_ranking = await this.db.db
//       .select()
//       .from(ActiveMatches)
//       .where(eq(ActiveMatches.ranking_id, ranking_id))

//     const active_matches = active_matches_in_ranking.filter(active_match =>
//       active_match.team_players?.some(team =>
//         team.some(player_id => player_ids.some(player => player.data.id === player_id)),
//       ),
//     )

//     return active_matches.map(active_match => new ActiveMatch(active_match, this.db))
//   }
// }
