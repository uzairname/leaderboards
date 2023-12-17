import * as D from 'discord-api-types/v10'
import type { GuildRanking, Ranking } from '../../../../database/models'
import {
  type ChatInteractionContext,
  ChoiceField,
  type CommandInteractionResponse,
  CommandView,
  IntField,
  StringField,
  _,
  getModalSubmitEntries
} from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import type { App } from '../../../app/app'
import { AppErrors, UserErrors } from '../../../app/errors'
import {
  Colors,
  commandMention,
  dateTimestamp,
  messageLink,
  toMarkdown
} from '../../../messages/message_pieces'
import { Messages } from '../../../messages/messages'
import { checkGuildInteraction } from '../../utils/checks'
import { create_choice_value, rankingsAutocomplete } from '../../utils/common'
import { help_cmd } from '../help'
import { restore_cmd } from '../restore'
import { creatingNewRankingPage, onCreateConfirmBtn } from './new_ranking'
import { rankingSettingsPage } from './ranking_settings'
import { onRenameModal } from './ranking_settings'
import { onBtnDelete } from './ranking_settings'
import { onDeleteModal } from './ranking_settings'

const ranking_option_name = 'ranking'

export const rankings_cmd_def = new CommandView({
  type: D.ApplicationCommandType.ChatInput,

  custom_id_prefix: 'r',

  command: {
    name: 'rankings',
    description: 'Create and manage rankings and leaderboards',
    options: [
      {
        name: ranking_option_name,
        type: D.ApplicationCommandOptionType.String,
        description: 'Select a rankings or create a new one',
        autocomplete: true
      }
    ]
  },

  state_schema: {
    user_id: new StringField(),
    page: new ChoiceField({
      'all rankings': _,
      'ranking settings': _,
      'creating new': _
    }),
    component: new ChoiceField({
      'btn:rename': _,
      'btn:create': _,
      'modal:name': _,
      'btn:create confirm': _,
      'btn:delete': _,
      'modal:delete confirm': _
    }),
    selected_ranking_id: new IntField(),
    input_name: new StringField(),
    input_players_per_team: new IntField(),
    input_num_teams: new IntField()
  }
})

export const rankings_cmd = (app: App) =>
  rankings_cmd_def
    .onAutocomplete(rankingsAutocomplete(app, true))

    .onCommand(async ctx => {
      ctx.state.save.user_id(checkGuildInteraction(ctx.interaction).member.user.id)

      let option_value = (
        ctx.interaction.data.options?.find(o => o.name === ranking_option_name) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (option_value === create_choice_value) {
        ctx.state.save.page('creating new')
        return rankingNameModal(ctx)
      }

      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: {
            flags: D.MessageFlags.Ephemeral
          }
        },
        async ctx => {
          if (option_value) {
            ctx.state.save.selected_ranking_id(parseInt(option_value))
            ctx.edit(await rankingSettingsPage(app, ctx))
          } else {
            ctx.state.save.page('all rankings')
            await ctx.edit(await allGuildRankingsPage(app, ctx))
          }
        }
      )
    })

    .onComponent(async ctx => {
      // if (!ctx.state.is.user_id(ctx.interaction.member?.user.id)) {
      //   throw new UserErrors.NotComponentOwner(ctx.state.data.user_id)
      // }

      if (ctx.state.is.page('all rankings')) {
        if (ctx.state.is.component('btn:create')) {
          ctx.state.save.page('creating new')
          return rankingNameModal(ctx)
        }
      }
      if (ctx.state.is.page('creating new')) {
        if (ctx.state.is.component('btn:create confirm')) {
          return await onCreateConfirmBtn(app, ctx)
        }
        return creatingNewRankingPage(ctx)
      }

      if (ctx.state.is.page('ranking settings')) {
        if (ctx.state.is.component('btn:rename')) {
          return rankingNameModal(ctx)
        }
        if (ctx.state.is.component('modal:name')) {
          return onRenameModal(app, ctx)
        }
        if (ctx.state.is.component('btn:delete')) {
          return await onBtnDelete(app, ctx)
        }
        if (ctx.state.is.component('modal:delete confirm')) {
          return await onDeleteModal(app, ctx)
        }
        return {
          type: D.InteractionResponseType.UpdateMessage,
          data: await rankingSettingsPage(app, ctx)
        }
      }

      throw new AppErrors.UnknownState(`${JSON.stringify(ctx.state.data)}`)
    })

export async function allGuildRankingsPage(
  app: App,
  ctx: ChatInteractionContext<typeof rankings_cmd_def>
): Promise<D.APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })

  let embeds: D.APIEmbed[] = [
    {
      title: 'Rankings',
      description:
        guild_rankings.length === 0
          ? Messages.no_rankings_description
          : `\nYou have **${guild_rankings.length}** ranking${
              guild_rankings.length === 1 ? `` : `s`
            }` + ` in this server`,
      fields: [],
      color: Colors.EmbedBackground
    },
    {
      title: 'Helpful Commands',
      description:
        `${await commandMention(app, rankings_cmd_def)} **[name]** - Manage a ranking` +
        `\n${await commandMention(app, restore_cmd)}` +
        ` - Restore or update missing channels and messages` +
        `\n${await commandMention(app, help_cmd)} - Help`,
      color: Colors.EmbedBackground
    }
  ]

  let fields: D.APIEmbedField[] = []

  await Promise.all(
    guild_rankings.map(async item => {
      fields.push({
        name: toMarkdown(item.ranking.data.name),
        value: await guildRankingDetails(app, item.guild_ranking, item.ranking),
        inline: true
      })
    })
  )

  sentry.debug('fields: ' + JSON.stringify(fields.length))

  embeds[0].fields = fields

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds,
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: ctx.state.set.component('btn:create').encode(),
            label: 'Create a Ranking'
          }
        ]
      }
    ]
  }
}

export async function guildRankingDetails(
  app: App,
  guild_ranking: GuildRanking,
  ranking: Ranking
): Promise<string> {
  const created_time = ranking.data.time_created
  const created_time_msg = created_time ? `Created on ${dateTimestamp(created_time)}` : ``

  // display link
  if (guild_ranking.data.leaderboard_message_id) {
    const display_message_link = messageLink(
      guild_ranking.data.guild_id,
      guild_ranking.data.leaderboard_channel_id || '0',
      guild_ranking.data.leaderboard_message_id
    )
    var display_message_msg = `${display_message_link}`
  } else {
    display_message_msg = `Not displayed in a message anywhere`
  }

  const description = `${display_message_msg}` + `\n${created_time_msg}`

  return description
}

export function rankingNameModal(
  ctx: ChatInteractionContext<typeof rankings_cmd_def>
): CommandInteractionResponse {
  const example_names = [`Smash 1v1`, `Starcraft 2v2`, `Valorant 5s`, `Chess`, `Ping Pong 1v1`]

  let response: D.APIModalInteractionResponse = {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:name').encode(),
      title: 'Name your new ranking',
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              style: D.TextInputStyle.Short,
              custom_id: 'name',
              label: 'Name',
              placeholder: `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`
            }
          ]
        }
      ]
    }
  }
  return response
}
