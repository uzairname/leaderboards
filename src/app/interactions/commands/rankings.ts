import {
  ApplicationCommandType,
  MessageFlags,
  ComponentType,
  ButtonStyle,
  APIModalInteractionResponse,
  TextInputStyle,
  APIActionRowComponent,
  APIMessageActionRowComponent,
  ModalSubmitComponent,
  InteractionResponseType,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandOptionChoice,
  ApplicationCommandOptionType,
  APIInteractionResponseCallbackData,
  APIEmbed,
  APIEmbedField,
} from 'discord-api-types/v10'

import {
  CommandInteractionResponse,
  ChatInteractionResponse,
} from '../../../discord/interactions/types'
import {
  AutocompleteContext,
  CommandContext,
  CommandView,
  ComponentContext,
  Context,
} from '../../../discord/interactions/views'
import {
  ChoiceField,
  NumberField,
  StringField,
} from '../../../discord/interactions/utils/string_data'

import { assertNonNullable } from '../../../utils/utils'

import { App } from '../../app'
import { AppErrors, Errors } from '../../messages/errors'

import {
  Colors,
  commandMention,
  messageLink,
  relativeTimestamp,
  toMarkdown,
} from '../../messages/message_pieces'
import { checkGuildInteraction } from '../utils/checks'
import { checkMemberBotAdmin } from '../../modules/user_permissions'

import { getOrAddGuild } from '../../modules/guilds'
import {
  getRankingById,
  deleteRanking,
  createNewRankingInGuild,
  updateLeaderboard,
} from '../../modules/rankings'

import { restore_cmd_def } from './restore'
import { GuildRanking, Ranking } from '../../../database/models'
import { sentry } from '../../../utils/globals'

const rankings_cmd_def = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'r',

  command: {
    name: 'rankings',
    description: 'Create and manage rankings in this server',
    options: [
      {
        name: 'ranking',
        type: ApplicationCommandOptionType.String,
        description: 'Select a ranking or create a new one',
        autocomplete: true,
      },
    ],
  },

  state_schema: {
    owner_id: new StringField(),
    page: new ChoiceField({
      main: null,
      'ranking settings': null,
      'creating new': null,
      overview: null,
    }),
    component: new ChoiceField({
      'btn:rename': null,
      'btn:create': null,
      'modal:name': null,
      'btn:create confirm': null,
      'btn:delete': null,
      'modal:delete confirm': null,
    }),
    selected_ranking_id: new NumberField(),
    input_name: new StringField(),
  },
})

export default (app: App) =>
  rankings_cmd_def
    .onAutocomplete(async (ctx) => autocomplete(ctx, app))

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
        ctx.state.save.page('overview')
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await allGuildRankingsPage(ctx, app, interaction.guild_id),
        }
      }
    })

    .onComponent(async (ctx) => {
      // Checks
      const interaction = checkGuildInteraction(ctx.interaction)
      checkMemberBotAdmin(interaction.member, await getOrAddGuild(app, interaction.guild_id))
      if (!ctx.state.is.owner_id(ctx.interaction.member?.user.id)) {
        throw new AppErrors.NotComponentOwner(ctx.state.data.owner_id)
      }

      // Component
      if (ctx.state.is.component('btn:create')) {
        ctx.state.save.page('creating new')
        return rankingNameModal(ctx)
      } else if (ctx.state.is.component('btn:rename')) {
        return rankingNameModal(ctx)
      } else if (ctx.state.is.component('modal:name')) {
        ctx.state.save.input_name(ctx.modal_entries?.find((c) => c.custom_id === 'name')?.value)
        if (ctx.state.is.page('ranking settings')) {
          return onRenameModalSubmit(ctx, app)
        }
      } else if (ctx.state.is.component('btn:create confirm')) {
        return await onCreateConfirm(ctx, app, interaction.guild_id)
      } else if (ctx.state.is.component('btn:delete')) {
        return await onBtnDelete(ctx, app)
      } else if (ctx.state.is.component('modal:delete confirm')) {
        return await onDeleteCorfirm(ctx, app, ctx.modal_entries)
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

      throw new Errors.UnknownState(`${JSON.stringify(ctx.state.data)}`)
    })

export async function autocomplete(
  ctx: AutocompleteContext,
  app: App,
): Promise<APIApplicationCommandAutocompleteResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  // Get the ranking name typed so far.
  let input_value =
    (
      interaction.data.options?.find((o) => o.name === 'ranking') as
        | APIApplicationCommandInteractionDataStringOption
        | undefined
    )?.value ?? ''

  // Get rankings in this guild
  const guild = await getOrAddGuild(app, interaction.guild_id)
  const guild_lbs = await guild.guildRankings()

  // Filter the rankings by name and map them to an array of choices.
  const choices: APIApplicationCommandOptionChoice[] = guild_lbs
    .filter(
      (lb) =>
        // if no input so far, include all rankings
        !input_value || lb.ranking.data.name?.toLowerCase().includes(input_value.toLowerCase()),
    )
    .map((lb) => ({
      name: lb.ranking.data.name || 'Unnamed Ranking',
      value: lb.ranking.data.id.toString(),
    }))

  // Add a choice to create a new ranking.
  choices.push({
    name: 'Create a new ranking',
    value: 'create',
  })

  const response: APIApplicationCommandAutocompleteResponse = {
    type: InteractionResponseType.ApplicationCommandAutocompleteResult,
    data: {
      choices,
    },
  }

  return response
}

export async function allGuildRankingsPage(
  ctx: CommandContext<typeof rankings_cmd_def>,
  app: App,
  guild_id: string,
): Promise<APIInteractionResponseCallbackData> {
  const guild = await getOrAddGuild(app, guild_id)
  const guild_rankings = await guild.guildRankings()

  let embeds: APIEmbed[] = [
    {
      title: 'Rankings',
      description:
        `You have **${guild_rankings.length}** ranking` +
        `${guild_rankings.length === 1 ? '' : 's'}` +
        `. \n` +
        `To manage a ranking, type ` +
        `${await commandMention(app, rankings_cmd_def)} \`[name]\`\n` +
        `To restore any ranking's channels or messages, type ` +
        `${await commandMention(app, restore_cmd_def)} to restore it.`,
      color: Colors.EmbedBackground,
    },
  ]

  let fields: APIEmbedField[] = []

  await Promise.all(
    guild_rankings.map(async (item) => {
      fields.push({
        name: toMarkdown(item.ranking.data.name),
        value: await guildRankingDetails(app, item.guild_ranking),
        inline: true,
      })
    }),
  )

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
            label: 'Create a ranking',
          },
        ],
      },
    ],
  }
}

async function guildRankingDetails(app: App, guild_ranking: GuildRanking): Promise<string> {
  // created time
  const created_time = (await guild_ranking.ranking()).data.time_created
  const created_time_msg = created_time
    ? `Created ${relativeTimestamp(created_time)}`
    : `Created ${relativeTimestamp(new Date())}`

  // display link
  if (guild_ranking.data.leaderboard_message_id) {
    const display_message_link = messageLink(
      guild_ranking.data.guild_id,
      guild_ranking.data.leaderboard_channel_id || '0',
      guild_ranking.data.leaderboard_message_id,
    )

    var display_message_msg = `Displaying here: ${display_message_link}`
  } else {
    display_message_msg = `Not displayed in a message anywhere`
  }

  const description = `${created_time_msg}\n` + `${display_message_msg}`

  return description
}

export function rankingNameModal(
  ctx: Context<typeof rankings_cmd_def>,
): CommandInteractionResponse {
  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:name').encode(),
      title: 'Name your ranking',
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              style: TextInputStyle.Short,
              custom_id: 'name',
              label: 'Name',
              placeholder: 'e.g. Smash 1v1',
            },
          ],
        },
      ],
    },
  }
  return response
}

export async function rankingSettingsPage<Edit extends boolean>(
  app: App,
  ctx: Context<typeof rankings_cmd_def>,
  edit: Edit = false as Edit,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)

  assertNonNullable(ctx.state.data.selected_ranking_id, 'selected_ranking_id')
  const guild_ranking = await app.db.guild_rankings.get(
    interaction.guild_id,
    ctx.state.data.selected_ranking_id,
  )
  assertNonNullable(guild_ranking, 'guild_ranking')
  const ranking = await guild_ranking.ranking()

  const embed = {
    title: ranking.data.name || 'Unnamed Ranking',
    description: await guildRankingDetails(app, guild_ranking),
  }

  return {
    flags: MessageFlags.Ephemeral,
    embeds: [embed],
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
  app: App,
): Promise<ChatInteractionResponse> {
  assertNonNullable(ctx.state.data.selected_ranking_id, 'selected_ranking_id')
  const ranking = await getRankingById(app.db, ctx.state.data.selected_ranking_id)
  const old_name = ranking.data.name
  await updateLeaderboard(app, ranking, {
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
): ChatInteractionResponse {
  const response_type = InteractionResponseType.ChannelMessageWithSource

  const content = `Creating a new leaderboard named **${toMarkdown(ctx.state.data.input_name)}**`

  ctx.state.save.page('creating new')
  const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Primary,
          custom_id: ctx.state.set.component('btn:create confirm').encode(),
          label: 'Create',
        },
      ],
    },
  ]

  const response: ChatInteractionResponse = {
    type: response_type,
    data: {
      flags: MessageFlags.Ephemeral,
      content,
      components,
    },
  }
  return response
}

export async function onCreateConfirm(
  ctx: ComponentContext<typeof rankings_cmd_def>,
  app: App,
  guild_id: string,
): Promise<ChatInteractionResponse> {
  let input_name = ctx.state.data.input_name
  assertNonNullable(input_name, 'input_name')

  let guild = await getOrAddGuild(app, guild_id)
  let result = await createNewRankingInGuild(app, guild, {
    name: input_name,
  })
  ctx.state.save.page('ranking settings').save.selected_ranking_id(result.new_ranking.data.id)
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: await rankingSettingsPage(app, ctx),
  }
}

export async function onBtnDelete(ctx: ComponentContext<typeof rankings_cmd_def>, app: App) {
  assertNonNullable(ctx.state.data.selected_ranking_id, 'selected_leaderboard_id')
  const leaderboard = await getRankingById(app.db, ctx.state.data.selected_ranking_id)

  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:delete confirm').encode(),
      title: `Delete leaderboard?`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              label: `Type "delete" to delete ${leaderboard.data.name}`.substring(0, 45),
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

export async function onDeleteCorfirm(
  ctx: ComponentContext<typeof rankings_cmd_def>,
  app: App,
  modal_entries?: ModalSubmitComponent[],
): Promise<ChatInteractionResponse> {
  let input = modal_entries?.find((c) => c.custom_id === 'name')?.value

  assertNonNullable(ctx.state.data.selected_ranking_id, 'selected_leaderboard_id')
  const leaderboard = await getRankingById(app.db, ctx.state.data.selected_ranking_id)

  if (input?.toLowerCase() !== 'delete') {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: `Didn't delete ${leaderboard.data.name}`,
      },
    }
  }

  ctx.offload(async (ctx) => {
    await deleteRanking(app.bot, leaderboard)

    await ctx.editOriginal({
      flags: MessageFlags.Ephemeral,
      content: `Deleted **\`${leaderboard.data.name}\`** and all of its divisions, players, and matches`,
    })
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `Deleting **${leaderboard.data.name}**...`,
      components: [],
    },
  }
}
