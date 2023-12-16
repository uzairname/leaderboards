import {
  ApplicationCommandType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
  APIModalInteractionResponse,
  TextInputStyle,
  APIActionRowComponent,
  APIMessageActionRowComponent,
  InteractionResponseType,
  APIApplicationCommandInteractionDataStringOption,
  ApplicationCommandOptionType,
  APIInteractionResponseCallbackData,
  APIEmbed,
  APIEmbedField,
  APIModalSubmitInteraction,
} from 'discord-api-types/v10'
import {
  CommandInteractionResponse,
  ChatInteractionResponse,
  CommandView,
  ComponentContext,
  ChoiceField,
  IntField,
  StringField,
  ChatInteractionContext,
  InitialChatInteractionContext,
  _,
} from '../../../discord-framework'

import { nonNullable } from '../../../utils/utils'

import { sentry } from '../../../request/sentry'

import type { App } from '../../app/app'
import { AppErrors, UserErrors } from '../../app/errors'

import { getOrAddGuild } from '../../modules/guilds'
import {
  deleteRanking,
  createNewRankingInGuild,
  updateRanking,
} from '../../modules/rankings/rankings'
import { default_num_teams } from '../../../database/models/models/rankings'
import { default_players_per_team } from '../../../database/models/models/rankings'
import type { GuildRanking, Ranking } from '../../../database/models'

import {
  Colors,
  commandMention,
  dateTimestamp,
  messageLink,
  toMarkdown,
} from '../../messages/message_pieces'
import { ensureAdminPerms } from '../utils/checks'
import { checkGuildInteraction } from '../utils/checks'

import { restore_cmd_def } from './restore'
import { rankingsAutocomplete } from '../utils/common'
import { getModalSubmitEntries } from '../../../discord-framework'
import { help_command_def } from './help'
import { Messages } from '../../messages/messages'

export const rankings_command_def = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'lbs',

  command: {
    name: 'rankings',
    description: 'Create and manage rankings and leaderboards',
    options: [
      {
        name: 'ranking',
        type: ApplicationCommandOptionType.String,
        description: 'Select a rankings or create a new one',
        autocomplete: true,
      },
    ],
  },

  state_schema: {
    owner_id: new StringField(),
    page: new ChoiceField({
      'main ': _,
      'ranking settings': _,
      'creating new': _,
      'overview ': _,
    }),
    component: new ChoiceField({
      'btn:rename': _,
      'btn:create': _,
      'modal:name': _,
      'btn:create confirm': _,
      'btn:delete': _,
      'modal:delete confirm': _,
    }),
    selected_ranking_id: new IntField(),
    input_name: new StringField(),
    input_players_per_team: new IntField(),
    input_num_teams: new IntField(),
  },
})

export default (app: App) =>
  rankings_command_def
    .onAutocomplete(rankingsAutocomplete(app, true))

    .onCommand(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      ctx.state.save.owner_id(interaction.member.user.id)

      let selected_option = (
        interaction.data.options?.find((o) => o.name === 'ranking') as
          | APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (selected_option === 'create') {
        ctx.state.save.page('creating new')
        return rankingNameModal(ctx)
      }

      if (selected_option) {
        const selected_ranking_id = parseInt(selected_option)
        ctx.state.save.page('ranking settings').save.selected_ranking_id(selected_ranking_id)
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await rankingSettingsPage(app, ctx),
        }
      } else {
        ctx.state.save.page('overview ')
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await allGuildRankingsPage(app, ctx),
        }
      }
    })

    .onComponent(async (ctx) => {
      // Checks
      const interaction = checkGuildInteraction(ctx.interaction)
      if (!ctx.state.is.owner_id(ctx.interaction.member?.user.id)) {
        throw new UserErrors.NotComponentOwner(ctx.state.data.owner_id)
      }

      // Component
      if (ctx.state.is.component('btn:create')) {
        ctx.state.save.page('creating new')
        return rankingNameModal(ctx)
      } else if (ctx.state.is.component('btn:rename')) {
        return rankingNameModal(ctx)
      } else if (ctx.state.is.component('modal:name')) {
        ctx.state.save.input_name(
          getModalSubmitEntries(ctx.interaction as APIModalSubmitInteraction).find(
            (c) => c.custom_id === 'name',
          )?.value,
        )
        if (ctx.state.is.page('ranking settings')) {
          return onRenameModalSubmit(app, ctx)
        }
      } else if (ctx.state.is.component('btn:create confirm')) {
        return await onCreateConfirm(app, ctx, interaction.guild_id)
      } else if (ctx.state.is.component('btn:delete')) {
        return await onBtnDelete(app, ctx)
      } else if (ctx.state.is.component('modal:delete confirm')) {
        return await onDeleteModal(app, ctx)
      }

      // Page
      if (ctx.state.is.page('creating new')) {
        return creatingNewRankingPage(ctx)
      } else if (ctx.state.is.page('ranking settings')) {
        return {
          type: InteractionResponseType.UpdateMessage,
          data: await rankingSettingsPage(app, ctx),
        }
      }

      throw new AppErrors.UnknownState(`${JSON.stringify(ctx.state.data)}`)
    })

export async function allGuildRankingsPage(
  app: App,
  ctx: ChatInteractionContext<typeof rankings_command_def>,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })

  let embeds: APIEmbed[] = [
    {
      title: 'Rankings',
      description:
        guild_rankings.length === 0
          ? Messages.no_rankings_description
          : `\nYou have **${guild_rankings.length}** ranking${
              guild_rankings.length === 1 ? `` : `s`
            }` + ` in this server`,
      fields: [],
      color: Colors.EmbedBackground,
    },
    {
      title: 'Helpful Commands',
      description:
        `${await commandMention(app, rankings_command_def)} **[name]** - Manage a ranking` +
        `\n${await commandMention(app, restore_cmd_def)}` +
        ` - Restore or update missing channels and messages` +
        `\n${await commandMention(app, help_command_def)} - Help`,
      color: Colors.EmbedBackground,
    },
  ]

  let fields: APIEmbedField[] = []

  await Promise.all(
    guild_rankings.map(async (item) => {
      fields.push({
        name: toMarkdown(item.ranking.data.name),
        value: await guildRankingDetails(app, item.guild_ranking, item.ranking),
        inline: true,
      })
    }),
  )

  sentry.debug('fields: ' + JSON.stringify(fields.length))

  embeds[0].fields = fields

  return {
    flags: MessageFlags.Ephemeral,
    embeds,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            custom_id: ctx.state.set.component('btn:create').encode(),
            label: 'Create a Ranking',
          },
        ],
      },
    ],
  }
}

async function guildRankingDetails(
  app: App,
  guild_ranking: GuildRanking,
  ranking: Ranking,
): Promise<string> {
  // created time
  const created_time = ranking.data.time_created
  const created_time_msg = created_time ? `Created on ${dateTimestamp(created_time)}` : ``

  // display link
  if (guild_ranking.data.leaderboard_message_id) {
    const display_message_link = messageLink(
      guild_ranking.data.guild_id,
      guild_ranking.data.leaderboard_channel_id || '0',
      guild_ranking.data.leaderboard_message_id,
    )
    var display_message_msg = `${display_message_link}`
  } else {
    display_message_msg = `Not displayed in a message anywhere`
  }

  const description = `${display_message_msg}` + `\n${created_time_msg}`

  return description
}

export function rankingNameModal(
  ctx: ChatInteractionContext<typeof rankings_command_def>,
): CommandInteractionResponse {
  const example_names = [`Smash 1v1`, `Starcraft 2v2`, `Valorant 5s`, `Chess`, `Ping Pong 1v1`]

  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:name').encode(),
      title: 'Name your new ranking',
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              style: TextInputStyle.Short,
              custom_id: 'name',
              label: 'Name',
              placeholder: `e.g. ${
                example_names[Math.floor(Math.random() * example_names.length)]
              }`,
            },
          ],
        },
      ],
    },
  }
  return response
}

export async function rankingSettingsPage(
  app: App,
  ctx: ChatInteractionContext<typeof rankings_command_def, any>,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)

  let x = ctx.interaction

  const guild_ranking = await app.db.guild_rankings.get({
    guild_id: interaction.guild_id,
    ranking_id: nonNullable(ctx.state.data.selected_ranking_id, 'selected_ranking_id'),
  })
  const ranking = await guild_ranking.ranking()

  const embed: APIEmbed = {
    title: ranking.data.name || 'Unnamed Ranking',
    description: await guildRankingDetails(app, guild_ranking, ranking),
    color: Colors.EmbedBackground,
  }

  return {
    flags: MessageFlags.Ephemeral,
    embeds: [embed],
    content: ``,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: ctx.state.set.component('btn:rename').encode(),
            label: 'Rename',
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Danger,
            custom_id: ctx.state.set.component('btn:delete').encode(),
            label: 'Delete',
          },
        ],
      },
    ],
  }
}

export async function onRenameModalSubmit(
  app: App,
  ctx: ComponentContext<typeof rankings_command_def>,
): Promise<ChatInteractionResponse> {
  const ranking = await app.db.rankings.get(
    nonNullable(ctx.state.data.selected_ranking_id, 'selected_ranking_id'),
  )
  const old_name = ranking.data.name

  await ensureAdminPerms(app, ctx)
  await updateRanking(app, ranking, {
    name: ctx.state.data.input_name,
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Renamed **${toMarkdown(old_name)}** to **${toMarkdown(ranking.data.name)}**`,
      flags: MessageFlags.Ephemeral,
    },
  }
}

export function creatingNewRankingPage(
  ctx: ChatInteractionContext<typeof rankings_command_def>,
): ChatInteractionResponse {
  ctx.state.save.page('creating new')

  const players_per_team = ctx.state.data.input_players_per_team || default_players_per_team
  const num_teams = ctx.state.data.input_num_teams || default_num_teams

  const content =
    `Creating a new ranking named **${toMarkdown(ctx.state.data.input_name)}**` +
    ` with the following settings:` +
    `\n- Every match in this ranking will have **${num_teams}** teams` +
    ` and **${players_per_team}** player` +
    (players_per_team === 1 ? '' : 's') +
    ` per team`

  const embed: APIEmbed = {
    title: `Confirm?`,
    description: content,
    color: Colors.EmbedBackground,
  }

  const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Success,
          custom_id: ctx.state.set.component('btn:create confirm').encode(),
          label: 'Confirm',
        },
      ],
    },
  ]

  const response: ChatInteractionResponse = {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content,
      components,
    },
  }
  return response
}

export async function onCreateConfirm(
  app: App,
  ctx: InitialChatInteractionContext<typeof rankings_command_def>,
  guild_id: string,
): Promise<ChatInteractionResponse> {
  return ctx.defer(
    {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: `Creating Ranking...`,
      },
    },
    async (ctx) => {
      let input_name = nonNullable(ctx.state.data.input_name, 'input_name')

      const guild = await getOrAddGuild(app, guild_id)
      await ensureAdminPerms(app, ctx, guild)

      let result = await createNewRankingInGuild(app, guild, {
        name: input_name,
      })
      ctx.state.save.page('ranking settings').save.selected_ranking_id(result.new_ranking.data.id)
      return await ctx.editOriginal(await rankingSettingsPage(app, ctx))
    },
  )
}

export async function onBtnDelete(
  app: App,
  ctx: ChatInteractionContext<typeof rankings_command_def>,
): Promise<APIModalInteractionResponse> {
  const ranking = await app.db.rankings.get(
    nonNullable(ctx.state.data.selected_ranking_id, 'selected_ranking_id'),
  )

  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:delete confirm').encode(),
      title: `Delete ${ranking.data.name}?`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              label: `Type "delete" to delete`.substring(0, 45),
              placeholder: `delete`,
              custom_id: 'name',
              style: TextInputStyle.Short,
            },
          ],
        },
      ],
    },
  }
  return response
}

export async function onDeleteModal(
  app: App,
  ctx: ComponentContext<typeof rankings_command_def>,
): Promise<ChatInteractionResponse> {
  let input = getModalSubmitEntries(ctx.interaction as APIModalSubmitInteraction).find(
    (c) => c.custom_id === 'name',
  )?.value

  return ctx.defer(
    {
      type: InteractionResponseType.DeferredMessageUpdate,
    },
    async (ctx) => {
      const ranking = await app.db.rankings.get(
        nonNullable(ctx.state.data.selected_ranking_id, 'selected_ranking_id'),
      )

      if (input?.toLowerCase() !== 'delete') {
        await ctx.followup({
          flags: MessageFlags.Ephemeral,
          content: `Didn't delete ${ranking.data.name}`,
        })
      }

      await ensureAdminPerms(app, ctx)
      await deleteRanking(app, ranking)
      return await ctx.editOriginal({
        flags: MessageFlags.Ephemeral,
        content: `Deleted **\`${ranking.data.name}\`** and all of its players and matches`,
        embeds: [],
        components: [],
      })
    },
  )
}
