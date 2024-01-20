import * as D from 'discord-api-types/v10'
import type { GuildRanking, Ranking } from '../../../../database/models'
import { type InteractionContext, CommandView, _, field } from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import { unflatten } from '../../../../utils/utils'
import type { App } from '../../../app/app'
import { Colors, dateTimestamp, messageLink, escapeMd } from '../../../messages/message_pieces'
import { Messages } from '../../../messages/messages'
import { getOrAddGuild } from '../../../modules/guilds'
import { checkGuildInteraction } from '../../utils/checks'
import { create_choice_value, rankingsAutocomplete } from '../../utils/common'
import { create_ranking_view, createRankingModal } from './create_ranking'
import { guildRankingSettingsPage, ranking_settings_page } from './ranking_settings'

const ranking_option_name = 'ranking'

export const rankings_cmd_def = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'r',
  name: 'rankings',
  description: 'Create and manage rankings and leaderboards',
  options: [
    {
      name: ranking_option_name,
      type: D.ApplicationCommandOptionType.String,
      description: 'Select a rankings or create a new one',
      autocomplete: true,
    },
  ],
})

export const rankingsCmd = (app: App) =>
  rankings_cmd_def
    .onAutocomplete(rankingsAutocomplete(app, true))

    .onCommand(async ctx => {
      const ranking_option_value = (
        ctx.interaction.data.options?.find(o => o.name === ranking_option_name) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (ranking_option_value === create_choice_value) {
        return createRankingModal(app, { state: create_ranking_view.newState() })
      }

      if (ranking_option_value) {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: {
              flags: D.MessageFlags.Ephemeral,
            },
          },
          async ctx => {
            const ranking = await app.db.rankings.get(parseInt(ranking_option_value))
            return void ctx.edit(
              await guildRankingSettingsPage(app, {
                state: ranking_settings_page.newState({
                  ranking_id: ranking.data.id,
                  guild_id: checkGuildInteraction(ctx.interaction).guild_id,
                  ranking_name: ranking.data.name,
                }),
              }),
            )
          },
        )
      } else {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => ctx.edit(await allGuildRankingsPage(app, ctx)),
        )
      }
    })

    .onComponent(async ctx => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredMessageUpdate,
        },
        async ctx => ctx.edit(await allGuildRankingsPage(app, ctx)),
      )
    })

export async function allGuildRankingsPage(
  app: App,
  ctx: InteractionContext<typeof rankings_cmd_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })
  const guild = await getOrAddGuild(app, interaction.guild_id)

  let embeds: D.APIEmbed[] = [
    {
      description:
        `# ${escapeMd(guild.data.name)}'s Rankings`
        + `\n` + (guild_rankings.length === 0
          ? Messages.no_rankings_description
          : `You have **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}`
          + ` in this server`), //prettier-ignore
      fields: await Promise.all(
        guild_rankings.map(async item => {
          return {
            name: escapeMd(item.ranking.data.name),
            value: await guildRankingDetails(app, item.guild_ranking, { queue_teams: true }),
            inline: false,
          }
        }),
      ),
      color: Colors.Primary,
    },
  ]

  const ranking_btns: D.APIButtonComponent[] = guild_rankings.map(item => {
    return {
      type: D.ComponentType.Button,
      label: item.ranking.data.name || 'Unnamed Ranking',
      style: D.ButtonStyle.Primary,
      custom_id: ranking_settings_page
        .newState({
          ranking_id: item.ranking.data.id,
          guild_id: item.guild_ranking.data.guild_id,
        })
        .cId(),
    }
  })

  const btn_action_rows: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = unflatten(
    ranking_btns,
    5,
    false,
  ).map(btns => {
    sentry.debug(`btns ${JSON.stringify(btns)}`)
    return {
      type: D.ComponentType.ActionRow,
      components: btns,
    }
  })

  return {
    flags: D.MessageFlags.Ephemeral,
    content: '',
    embeds,
    components: [
      ...btn_action_rows.slice(0, 4),
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Success,
            custom_id: create_ranking_view.newState({ callback: createRankingModal }).cId(),
            label: 'Ranking',
            emoji: {
              name: '➕',
            },
          },
        ],
      },
    ],
  }
}

export async function guildRankingDetails(
  app: App,
  guild_ranking: GuildRanking,
  details?: {
    queue_teams?: boolean
  },
): Promise<string> {
  const ranking = await guild_ranking.ranking
  const time_created = ranking.data.time_created

  return (
    `- Match type: **` +new Array(ranking.data.num_teams).fill(ranking.data.players_per_team).join('v') + `**` 
    + `\n- ` + (guild_ranking.data.leaderboard_message_id
      ? messageLink(
          guild_ranking.data.guild_id,
          guild_ranking.data.leaderboard_channel_id || '0',
          guild_ranking.data.leaderboard_message_id,
        )
      : `Leaderboard not displayed anywhere`) 
    + (time_created ? `\n- Created on ${dateTimestamp(time_created)}` : ``) 
    + (details?.queue_teams ? `\n- Teams in queue: ${await (async ()=>{
      const queue_teams = await ranking.queueTeams()
      return Object.keys(queue_teams).length
    })()}` : ``)

    // prettier-ignore
  )
}
