import { Match, MatchStatus } from '@repo/db/models'
import { StateContext, ViewSignature } from '@repo/discord'
import { field, sortArraysByFirst } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { Colors, emojis, escapeMd, relativeTimestamp, space } from '../../services/utils/strings'
import { App } from '../../setup/app'

export const matches_view_sig = new ViewSignature({
  custom_id_prefix: 'mh',
  name: 'match history',
  state_schema: {
    message_sent: field.Bool(),
    match_id: field.Int(),
    guild_id: field.String(),
    ranking_ids: field.Array(field.Int()),
    player_ids: field.Array(field.Int()),
    user_ids: field.Array(field.String()),
    page_num: field.Int(),
  },
})

export const matches_view = matches_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.defer(async ctx => {
      return void (await (ctx.state.data.message_sent ? ctx.edit : ctx.followup)(
        await matchesPage(app, { ...ctx, state: ctx.state.set.message_sent(true) }),
      ))
    })
  },
})

export async function matchesPage(
  app: App,
  ctx: StateContext<typeof matches_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const state = ctx.state

  state.saveAll({
    message_sent: true,
    page_num: state.data.page_num ?? 0,
  })

  const matches_per_page = 5

  const matches = await app.db.matches.getMany({
    player_ids: state.data.player_ids,
    user_ids: state.data.user_ids,
    ranking_ids: state.data.ranking_ids,
    guild_id: state.data.guild_id,
    limit: matches_per_page + 1, // +1 to check if there are more pages
    offset: (state.data.page_num ?? 0) * matches_per_page,
  })

  // determine if on last page
  const is_last_page = matches.length <= matches_per_page
  if (matches.length > matches_per_page) {
    matches.shift()
  }

  const components: D.APIActionRowComponent<D.APIComponentInMessageActionRow>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          custom_id: state.set.page_num((state.data.page_num ?? 0) + 1).cId(),
          label: 'Older',
          disabled: is_last_page,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          custom_id: state.set.page_num((state.data.page_num ?? 0) - 1).cId(),
          label: 'Newer',
          disabled: state.data.page_num === 0,
        },
      ],
    },
  ]

  return {
    embeds:
      matches.length > 0
        ? await Promise.all(matches.map(async match => await matchSummaryEmbed(app, match.match)))
        : [
            {
              description: `No matches to show`,
              color: Colors.EmbedBackground,
            },
          ],
    components,
    flags: D.MessageFlags.Ephemeral,
  }
}

export async function matchSummaryEmbed(app: App, match: Match, {} = {}): Promise<D.APIEmbed> {
  const ranking = await match.ranking.fetch()

  const team_player_stats = await app.matches.playerDisplayStats(app, match)

  const embed: D.APIEmbed = {
    title: `${escapeMd(ranking.data.name)} Match #${match.data.number}`,
    color: {
      [MatchStatus.Finished]: Colors.Primary,
      [MatchStatus.Ongoing]: Colors.Pending,
      [MatchStatus.Canceled]: Colors.EmbedBackground,
    }[match.data.status],
  }

  const { winning_team_indices, is_draw } = app.matches.getProperties(match)

  let description: string | undefined = undefined

  if (is_draw) {
    description = `🤝 Draw`
  } else if (match.data.status === MatchStatus.Canceled) {
    description = `⚠️ Canceled`
  } else if (match.data.status === MatchStatus.Ongoing) {
    description = `⏳ Ongoing`
  }

  embed.description = description

  const single_player_teams = team_player_stats.every(t => t.length === 1)

  const fields: D.APIEmbedField[] = team_player_stats.map((team, team_num) => {
    const emoji = is_draw
      ? emojis.light_circle
      : winning_team_indices?.includes(team_num)
        ? emojis.green_triangle
        : emojis.red_triangle

    return {
      name: space,
      value: team
        .map(p => {
          if (undefined === p.after) {
            const provisional_text = p.before.is_provisional ? `?` : ``
            return app.players.mentionOrName(p.player) + `\n` + `**${p.before.points.toFixed(0)}${provisional_text}**`
          } else {
            const provisional_text = p.after.is_provisional ? `?` : ``

            const diff = p.after.points - p.before.points

            const rating_diff_text = `*(${(parseInt(diff.toFixed(0)) > 0 ? '+' : '') + diff.toFixed(0)})*`

            return (
              `${app.players.mentionOrName(p.player)}` +
              `\n` +
              (single_player_teams ? emoji : ``) +
              `**${p.after.points.toFixed(0)}${provisional_text}** ${rating_diff_text}`
            )
          }
        })
        .join('\n'),
      inline: true,
    }
  })

  const sorted_fields = (() => {
    if (match.data.outcome) {
      const [_, sorted] = sortArraysByFirst(match.data.outcome.team_scores, fields) // Sort by outcome, so that the winning team with highest score is first
      return sorted.reverse()
    } else {
      return fields
    }
  })()

  let details: string[] = []

  if (match.data.time_finished) {
    if (match.data.status === MatchStatus.Canceled) {
      details.push(`Canceled ${relativeTimestamp(match.data.time_finished)}`)
    } else {
      details.push(`Finished ${relativeTimestamp(match.data.time_finished)}`)
    }
  } else if (match.data.time_started) {
    details.push(`Started ${relativeTimestamp(match.data.time_started)}`)
  }

  details.push(`Match ID: **\`${match.data.id}\`**`)

  if (details) {
    sorted_fields.push({
      name: `${space}`,
      value: `-# ` + details.join(` | `),
    })
  }

  embed.fields = sorted_fields

  return embed
}
