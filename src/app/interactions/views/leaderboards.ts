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
import { AppErrors, Errors } from '../../errors'

import {
  Colors,
  commandMention,
  messageLink,
  relativeTimestamp,
  toMarkdown,
} from '../../utils/messages/message_pieces'
import { checkGuildInteraction, checkMemberBotAdmin } from '../../utils/checks'

import { getOrAddGuild } from '../../modules/guilds'
import {
  getLeaderboardById,
  deleteLeaderboard,
  createNewLeaderboardInGuild,
  updateLeaderboard,
} from '../../modules/leaderboards'
import { removeLeaderboardChannelsMessages } from '../../modules/channels/leaderboard_channels'

import restore, { restore_cmd_def } from './restore'
import { GuildLeaderboard, Leaderboard } from '../../../database/models'
import { sentry } from '../../../utils/globals'

const leaderboards_cmd_def = new CommandView({
  type: ApplicationCommandType.ChatInput,

  custom_id_prefix: 'lbs',

  command: {
    name: 'leaderboards',
    description: 'Create and manage leaderboards in this server',
    options: [
      {
        name: 'leaderboard',
        type: ApplicationCommandOptionType.String,
        description: 'Select a leaderboard or create a new one',
        autocomplete: true,
      },
    ],
  },

  state_schema: {
    owner_id: new StringField(),
    page: new ChoiceField({
      main: null,
      'lb settings': null,
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
    selected_leaderboard_id: new NumberField(),
    input_name: new StringField(),
  },
})

export default (app: App) =>
  leaderboards_cmd_def
    .onAutocomplete(async (ctx) => leaderboardsAutocomplete(ctx, app))

    .onCommand(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)
      ctx.state.save.owner_id(interaction.member.user.id)

      let selected_option = (
        interaction.data.options?.find((o) => o.name === 'leaderboard') as
          | APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (selected_option === 'create') {
        ctx.state.save.page('creating new')
        return leaderboardNameModal(ctx)
      }

      if (selected_option) {
        const selected_leaderboard_id = parseInt(selected_option)
        ctx.state.save.page('lb settings').save.selected_leaderboard_id(selected_leaderboard_id)
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await leaderboardSettingsPage(app, ctx),
        }
      } else {
        ctx.state.save.page('overview')
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await allGuildLeaderboardsPage(ctx, app, interaction.guild_id),
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
        return leaderboardNameModal(ctx)
      } else if (ctx.state.is.component('btn:rename')) {
        return leaderboardNameModal(ctx)
      } else if (ctx.state.is.component('modal:name')) {
        ctx.state.save.input_name(ctx.modal_entries?.find((c) => c.custom_id === 'name')?.value)
        if (ctx.state.is.page('lb settings')) {
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
        return creatingNewLeaderboardPage(ctx)
      } else if (ctx.state.is.page('lb settings')) {
        return {
          type: InteractionResponseType.UpdateMessage,
          data: await leaderboardSettingsPage(app, ctx),
        }
      }

      throw new Errors.UnknownState(`${JSON.stringify(ctx.state.data)}`)
    })

export async function leaderboardsAutocomplete(
  ctx: AutocompleteContext,
  app: App,
): Promise<APIApplicationCommandAutocompleteResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  // Get the leaderboard name typed so far.
  let input_value =
    (
      interaction.data.options?.find((o) => o.name === 'leaderboard') as
        | APIApplicationCommandInteractionDataStringOption
        | undefined
    )?.value ?? ''

  // Get leaderboards in this guild
  const guild = await getOrAddGuild(app, interaction.guild_id)
  const guild_lbs = await guild.guildLeaderboards()

  // Filter the leaderboards by name and map them to an array of choices.
  const choices: APIApplicationCommandOptionChoice[] = guild_lbs
    .filter(
      (lb) =>
        // if no input so far, include all leaderboards
        !input_value || lb.leaderboard.data.name.toLowerCase().includes(input_value.toLowerCase()),
    )
    .map((lb) => ({
      name: lb.leaderboard.data.name,
      value: lb.leaderboard.data.id.toString(),
    }))

  // Add a choice to create a new leaderboard.
  choices.push({
    name: 'Create a new leaderboard',
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

export async function allGuildLeaderboardsPage(
  ctx: CommandContext<typeof leaderboards_cmd_def>,
  app: App,
  guild_id: string,
): Promise<APIInteractionResponseCallbackData> {
  const guild = await getOrAddGuild(app, guild_id)
  const guild_leaderboards = await guild.guildLeaderboards()

  let embeds: APIEmbed[] = [
    {
      title: 'Leaderboards',
      description:
        `You have **${guild_leaderboards.length}** leaderboard` +
        `${guild_leaderboards.length === 1 ? '' : 's'}` +
        `. \n` +
        `To manage a leaderboard, type ` +
        `${await commandMention(app, leaderboards_cmd_def)} \`[name]\`\n` +
        `To restore any leaderboard's channels or messages` +
        `${await commandMention(app, restore_cmd_def)} to restore it.`,
      color: Colors.EmbedBackground,
    },
  ]

  let fields: APIEmbedField[] = []

  sentry.debug("guild_leaderboards: " + JSON.stringify(guild_leaderboards.length))
  await Promise.all(
    guild_leaderboards.map(async (item) => {
      fields.push({
        name: toMarkdown(item.leaderboard.data.name),
        value: await guildLeaderboardDetails(app, item.guild_leaderboard),
        inline: true,
      })
    }),
  )

  sentry.debug("fields: " + JSON.stringify(fields.length))

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
            label: 'Create a Leaderboard',
          },
        ],
      },
    ],
  }
}

async function guildLeaderboardDetails(
  app: App,
  guild_leaderboard: GuildLeaderboard,
): Promise<string> {
  // created time
  const created_time = (await guild_leaderboard.leaderboard()).data.time_created
  const created_time_msg = created_time
    ? `Created ${relativeTimestamp(created_time)}`
    : `Created ${relativeTimestamp(new Date())}`

  // display link
  if (guild_leaderboard.data.display_message_id) {
    const display_message_link = messageLink(
      guild_leaderboard.data.guild_id,
      guild_leaderboard.data.display_channel_id || '0',
      guild_leaderboard.data.display_message_id || '0',
    )

    var display_message_msg = `Displaying here: ${display_message_link}`
  } else {
    display_message_msg = `Not displayed in a message anywhere`
  }

  const description = `${created_time_msg}\n` + `${display_message_msg}`

  return description
}

export function leaderboardNameModal(
  ctx: Context<typeof leaderboards_cmd_def>,
): CommandInteractionResponse {
  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:name').encode(),
      title: 'Name your leaderboard',
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

export async function leaderboardSettingsPage<Edit extends boolean>(
  app: App,
  ctx: Context<typeof leaderboards_cmd_def>,
  edit: Edit = false as Edit,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)

  assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
  const guild_leaderboard = await app.db.guild_leaderboards.get(
    interaction.guild_id,
    ctx.state.data.selected_leaderboard_id,
  )
  assertNonNullable(guild_leaderboard, 'guild_leaderboard')
  const leaderboard = await guild_leaderboard.leaderboard()

  const embed = {
    title: leaderboard.data.name,
    description: await guildLeaderboardDetails(app, guild_leaderboard),
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
  ctx: ComponentContext<typeof leaderboards_cmd_def>,
  app: App,
): Promise<ChatInteractionResponse> {
  assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
  const leaderboard = await getLeaderboardById(app.db, ctx.state.data.selected_leaderboard_id)
  const old_name = leaderboard.data.name
  await updateLeaderboard(app, leaderboard, {
    name: ctx.state.data.input_name,
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Renamed **${toMarkdown(old_name)}** to **${toMarkdown(leaderboard.data.name)}**`,
      flags: MessageFlags.Ephemeral,
    },
  }
}

export function creatingNewLeaderboardPage(
  ctx: ComponentContext<typeof leaderboards_cmd_def>,
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
  ctx: ComponentContext<typeof leaderboards_cmd_def>,
  app: App,
  guild_id: string,
): Promise<ChatInteractionResponse> {
  let input_name = ctx.state.data.input_name
  assertNonNullable(input_name, 'input_name')

  let guild = await getOrAddGuild(app, guild_id)
  let result = await createNewLeaderboardInGuild(app, guild, {
    name: input_name,
  })
  ctx.state.save.page('lb settings').save.selected_leaderboard_id(result.new_leaderboard.data.id)
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: await leaderboardSettingsPage(app, ctx),
  }
}

export async function onBtnDelete(ctx: ComponentContext<typeof leaderboards_cmd_def>, app: App) {
  assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
  const leaderboard = await getLeaderboardById(app.db, ctx.state.data.selected_leaderboard_id)

  response = Modal()
    .setTitle(`Delete leaderboard?`)
    .setCustomId(ctx.state.set.component('modal:delete confirm').encode())
    .setComponents([
      ActionRow()
        .addComponent(
          TextInput()
            .setLabel(`Type "delete" to delete "${leaderboard.data.name}"`)
            .setPlaceholder(`delete`)
            .setCustomId('name')
            .setStyle(TextInputStyle.Short),
        )
        .toComponent(),
    ])


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
  ctx: ComponentContext<typeof leaderboards_cmd_def>,
  app: App,
  modal_entries?: ModalSubmitComponent[],
): Promise<ChatInteractionResponse> {
  let input = modal_entries?.find((c) => c.custom_id === 'name')?.value

  assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
  const leaderboard = await getLeaderboardById(app.db, ctx.state.data.selected_leaderboard_id)

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
    await deleteLeaderboard(app.bot, leaderboard)

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
