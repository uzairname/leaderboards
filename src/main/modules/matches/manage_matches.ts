import { DiscordAPIError } from '@discordjs/rest'
import { Match, Player } from '../../../database/models'
import { MatchInsert } from '../../../database/types'
import { sentry } from '../../../request/sentry'
import { App } from '../../app/app'
import { AppErrors } from '../../app/errors'
import { validate } from '../utils'
import { scoreRankingHistory } from './scoring/score_matches'

export async function updateMatch(
  app: App,
  match: Match,
  outcome?: number[],
  metadata?: { [key: string]: unknown },
) {
  validateMatch({
    ...match.data,
    outcome,
    metadata,
  })

  await match.update({
    outcome,
    metadata,
  })

  if (outcome) {
    sentry.debug('outcome')
    try {
      await scoreRankingHistory(app, await match.ranking(), match.data.time_finished ?? undefined)
    } catch (e) {
      if (!(e instanceof AppErrors.RescoreMatchesLimitExceeded)) throw e
    }
  }

  await app.events.MatchCreatedOrUpdated.emit(match)
}

export async function deleteMatch(app: App, match: Match): Promise<void> {
  const ranking = await match.ranking()
  const time = match.data.time_finished
  await match.delete()
  await scoreRankingHistory(app, ranking, time ?? undefined)

  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: ranking.data.id })
  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      const summary_message = await match.summaryMessage(guild_ranking.guild.data.id)
      if (!summary_message) return
      const channel_id = guild_ranking.guild.data.match_results_textchannel_id
      if (!channel_id || !summary_message.message_id) return
      try {
        await app.bot.deleteMessage(channel_id, summary_message.message_id)
      } catch (e) {
        if (!(e instanceof DiscordAPIError)) throw e
      }
    }),
  )
}

export function validateMatch<T extends Partial<{ players: Player[][] } & MatchInsert>>(o: T): T {
  if (o.outcome) {
    if (o.team_players) {
      validate(
        o.outcome!.length === o.team_players!.length,
        `Match outcome and players length must match`,
      )
    }
    if (o.players) {
      validate(
        o.outcome!.length === o.players!.length,
        `Match outcome and players length must match`,
      )
    }
  }
  if (o.players) {
    validate(
      o.players.flat().length === new Set(o.players.flat()).size,
      `Duplicate players in a match`,
    )
    validate(
      o.players.flat().every(p => p.data.ranking_id === o.ranking_id),
      `Players must be from the same ranking`,
    )
  }
  return o
}
