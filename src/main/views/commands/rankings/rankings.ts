import * as D from 'discord-api-types/v10'
import type { GuildRanking, Ranking } from '../../../../database/models'
import { type InteractionContext, CommandView, _, field } from '../../../../discord-framework'
import { ViewState } from '../../../../discord-framework/interactions/view_state'
import { sentry } from '../../../../request/sentry'
import { unflatten } from '../../../../utils/utils'
import type { App } from '../../../app/app'
import { AppErrors } from '../../../app/errors'
import {
  Colors,
  commandMention,
  dateTimestamp,
  messageLink,
  escapeMd,
} from '../../../messages/message_pieces'
import { Messages } from '../../../messages/messages'
import { getOrAddGuild } from '../../../modules/guilds'
import { max_ranking_name_length } from '../../../modules/rankings/rankings'
import { checkGuildInteraction } from '../../utils/checks'
import { create_choice_value, rankingsAutocomplete } from '../../utils/common'
import { help_cmd } from '../help'
import { restore_cmd } from '../restore'
import { newRankingModal, onCreateConfirmBtn, onCreateNewModal } from './new_ranking'
import { rankingSettingsPage, ranking_settings_page_def } from './ranking_settings'

const ranking_option_name = 'ranking'

export const rankings_cmd_def = new CommandView({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_id: 'r',
  name: 'rankings',
  description: 'Create and manage rankings and leaderboards',
  options: [
    {
      name: ranking_option_name,
      type: D.ApplicationCommandOptionType.String,
      description: 'Select a rankings or create a new one',
      autocomplete: true,
    },
    {
      name: 'create new',
      type: D.ApplicationCommandOptionType.String,
      description: 'Create a new ranking',
    },
  ],
  state_schema: {
    page: field.Choice({
      'all rankings': _,
      'creating new': _,
    }),
    component: field.Choice({
      'btn:create': _,
      'modal:create new': _,
      'btn:create confirm': _,
      'select:ranking': _,
    }),
    input_name: field.String(),
    input_players_per_team: field.Int(),
    input_num_teams: field.Int(),
  },
})

export const rankings = (app: App) =>
  rankings_cmd_def
    .onAutocomplete(rankingsAutocomplete(app, true))

    .onCommand(async ctx => {
      const ranking_option_value = (
        ctx.interaction.data.options?.find(o => o.name === ranking_option_name) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (ranking_option_value === create_choice_value) {
        // Selected create new ranking. Input name
        return newRankingModal(ctx.state)
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
            ctx.edit(
              await rankingSettingsPage(
                app,
                parseInt(ranking_option_value),
                checkGuildInteraction(ctx.interaction).guild_id,
              ),
            )
          },
        )
      } else {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            await ctx.edit(await allGuildRankingsPage(app, ctx))
          },
        )
      }
    })

    .onComponent(async ctx => {
      if (ctx.state.is.component('btn:create')) {
        // can be from any page
        return newRankingModal(ctx.state)
      }

      if (ctx.state.is.component('btn:create confirm')) {
        return onCreateConfirmBtn(app, ctx)
      }

      if (ctx.state.is.component('modal:create new')) {
        return await onCreateNewModal(app, ctx)
      }

      if (ctx.state.is.page('all rankings')) {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            await ctx.edit(await allGuildRankingsPage(app, ctx))
          },
        )
      }

      throw new AppErrors.UnknownState(`${JSON.stringify(ctx.state.data)}`)
    })

export async function allGuildRankingsPage(
  app: App,
  ctx: InteractionContext<typeof rankings_cmd_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  ctx.state.save.page('all rankings')
  const interaction = checkGuildInteraction(ctx.interaction)
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })
  const guild = await getOrAddGuild(app, interaction.guild_id)

  const guild_name = guild.data.name ?? 'Unnamed Server'

  let embeds: D.APIEmbed[] = [
    {
      description:
        `# ${escapeMd(guild.data.name)}'s Rankings`
        + `\n` + (guild_rankings.length === 0
          ? Messages.no_rankings_description
          : `You have **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}` 
            + ` in this server`), //prettier-ignore
      fields: [],
      color: Colors.Primary,
    },
    // {
    //   title: 'Other Commands',
    //   description:
    //     `${await commandMention(app, rankings_cmd_def)} **[name]** - Manage a ranking` +
    //     `\n${await commandMention(app, help_cmd)} - Help`,
    //   color: Colors.Secondary,
    // },
  ]

  embeds[0].fields = await Promise.all(
    guild_rankings.map(async item => {
      return {
        name: escapeMd(item.ranking.data.name),
        value: await guildRankingDetails(app, item.guild_ranking, item.ranking),
        inline: true,
      }
    }),
  )

  const ranking_btns: D.APIButtonComponent[] = guild_rankings.map(item => {
    return {
      type: D.ComponentType.Button,
      label: item.ranking.data.name || 'Unnamed Ranking',
      style: D.ButtonStyle.Primary,
      custom_id: ranking_settings_page_def
        .getState({
          ranking_id: item.ranking.data.id,
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
            style: D.ButtonStyle.Primary,
            custom_id: ctx.state.set.component('btn:create').cId(),
            label: 'Create a Ranking',
          },
        ],
      },
    ],
  }
}

export async function guildRankingDetails(
  app: App,
  guild_ranking: GuildRanking,
  ranking: Ranking,
): Promise<string> {
  const time_created = ranking.data.time_created
  const time_created_msg = time_created ? `Created on ${dateTimestamp(time_created)}` : ``

  // display link
  const display_message_msg = guild_ranking.data.leaderboard_message_id
    ? messageLink(
        guild_ranking.data.guild_id,
        guild_ranking.data.leaderboard_channel_id || '0',
        guild_ranking.data.leaderboard_message_id,
      )
    : `Not displayed in a message anywhere`

  return `${display_message_msg}` + `\n${time_created_msg}`
}

export function rankingNameTextInput(
  required: boolean = true,
): D.APIActionRowComponent<D.APITextInputComponent> {
  const example_names = [
    `Smash 1v1`,
    `Starcraft 2v2`,
    `Valorant 5s`,
    `Chess`,
    `Ping Pong 1v1`,
    `Ranked Customs 2v2`,
    `Halo Comp 8s`,
    `Chess Rapid`,
    `Elden Ring League PC`,
    `Rounds Battleground`,
    `Ranked Brawl 2v2`,
  ]
  return {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.TextInput,
        style: D.TextInputStyle.Short,
        custom_id: 'name',
        label: 'Name',
        placeholder: `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`,
        max_length: max_ranking_name_length,
        required,
      },
    ],
  }
}
