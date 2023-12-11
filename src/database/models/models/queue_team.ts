import { and, eq, sql } from 'drizzle-orm'

import { QueueTeams, TeamPlayers } from '../../schema'

import { DbObject, DbObjectManager } from '../managers'
import { QueueTeamInsert, QueueTeamSelect, QueueTeamUpdate } from '../types'
import { Player, Ranking, Team } from '..'

export class QueueTeam extends DbObject<QueueTeamSelect> {
}

export class QueueTeamsManager extends DbObjectManager {

}
