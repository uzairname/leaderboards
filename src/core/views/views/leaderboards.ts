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
  APIInteractionResponse,
  APIMessageStringSelectInteractionData,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandAutocompleteResponse,
  APIApplicationCommandOptionChoice,
  ApplicationCommandOptionType,
} from 'discord-api-types/v10'

import {
  CommandInteractionResponse,
  ChatInteractionResponse,
} from '../../../discord/interactions/views/types'
import {
  AutocompleteContext,
  CommandContext,
  CommandView,
  ComponentContext,
  Context,
} from '../../../discord/interactions/views/views'
import {
  ChoiceField,
  NumberField,
  StringField,
} from '../../../discord/interactions/views/string_data'

import { assertNonNullable } from '../../../utils/utils'
import { config, sentry } from '../../../utils/globals'

import { App } from '../../app'
import { AppErrors, Errors } from '../../errors'

import { channelMention, commandMention } from '../../helpers/messages/message_pieces'
import { checkGuildInteraction, checkMemberBotAdmin } from '../../helpers/checks'

import { getOrAddGuild } from '../../modules/guilds'
import {
  getLeaderboardById,
  deleteLeaderboard,
  createNewLeaderboardInGuild,
  updateLeaderboard,
} from '../../modules/leaderboards'
import { Guilds } from '../../../database/schema'

const leaderboards_cmd = new CommandView({
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
      'lb settings': undefined,
      'creating new': undefined,
    }),
    component: new ChoiceField({
      'btn:rename': null,
      'btn:create': null,
      'modal:name': null,
      'select:queue type': null,
      'btn:create confirm': null,
      'btn:delete': null,
      'modal:delete confirm': null,
    }),
    selected_leaderboard_id: new NumberField(),
    selected_leaderboard_name: new StringField(),
    input_name: new StringField(),
    selected_type: new ChoiceField({
      simple: null,
      '1v1': null,
    }),
  },
})

export default (app: App) =>
  leaderboards_cmd
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

      const selected_leaderboard_id = selected_option ? parseInt(selected_option) : undefined

      if (selected_leaderboard_id) {
        const guild_leaderboard = await app.db.guild_leaderboards.get(
          interaction.guild_id,
          selected_leaderboard_id,
        )
        if (!guild_leaderboard) throw new Errors.UnknownLeaderboard()
        const leaderboard = await guild_leaderboard.leaderboard()
        ctx.state.save.selected_leaderboard_name(leaderboard.data.name)
        ctx.state.save.selected_leaderboard_id(leaderboard.data.id)
        return leaderboardSettingsPage(ctx)
      } else {
        return await allGuildLeaderboardsPage(ctx, app, interaction.guild_id)
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
      } else if (ctx.state.is.component('select:queue type')) {
        let data = ctx.interaction.data as APIMessageStringSelectInteractionData
        ctx.state.save.selected_type(data.values[0] === 'simple' ? 'simple' : '1v1')
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
        return leaderboardSettingsPage(ctx)
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
  ctx: CommandContext<typeof leaderboards_cmd>,
  app: App,
  guild_id: string,
): Promise<CommandInteractionResponse> {
  const guild = await getOrAddGuild(app, guild_id)
  const guild_leaderboards = await guild.guildLeaderboards()

  let content = `Current Leaderboards. To manage a leaderboard, type ${await commandMention(
    app,
    leaderboards_cmd.options.command.name,
  )} \`[name]\`\n`

  guild_leaderboards.forEach((item) => {
    if (item.guild_leaderboard.data.display_channel_id) {
      var channel_mention = channelMention(item.guild_leaderboard.data.display_channel_id)
    } else {
      channel_mention = `Either deleted or not set. Type ${commandMention(
        app,
        'restore',
        ApplicationCommandType.ChatInput,
      )} to restore it.`
    }
    content += `\n### ${item.leaderboard.data.name}\n Display Channel: ${channel_mention}`
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: 'Make or edit leaderboards\n' + content,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: ctx.state.set.component('btn:create').encode(),
              label: 'Make a Leaderboard',
            },
          ],
        },
      ],
    },
  }
}

export function leaderboardNameModal(
  ctx: Context<typeof leaderboards_cmd>,
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

export async function leaderboardSettingsPage(
  ctx: Context<typeof leaderboards_cmd>,
): Promise<CommandInteractionResponse> {
  ctx.state.save.page('lb settings')
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `Leaderboard **${ctx.state.data.selected_leaderboard_name}**`,
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
    },
  }
}

export async function onRenameModalSubmit(
  ctx: ComponentContext<typeof leaderboards_cmd>,
  app: App,
): Promise<ChatInteractionResponse> {
  assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
  await updateLeaderboard(app, ctx.state.data.selected_leaderboard_id, {
    name: ctx.state.data.input_name,
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Renamed **${ctx.state.data.selected_leaderboard_name}** to **${ctx.state.data.input_name}**`,
      flags: MessageFlags.Ephemeral,
    },
  }
}

export function creatingNewLeaderboardPage(
  ctx: ComponentContext<typeof leaderboards_cmd>,
): ChatInteractionResponse {
  const response_type = InteractionResponseType.ChannelMessageWithSource

  assertNonNullable(ctx.state.data.input_name, 'input_name')
  const content = `Creating a new leaderboard named **${ctx.state.data.input_name}**`

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
  ctx: ComponentContext<typeof leaderboards_cmd>,
  app: App,
  guild_id: string,
): Promise<ChatInteractionResponse> {
  let input_name = ctx.state.data.input_name
  assertNonNullable(input_name, 'input_name')

  let guild = await getOrAddGuild(app, guild_id)
  let result = await createNewLeaderboardInGuild(app, guild, {
    name: input_name,
  })

  let response: APIInteractionResponse = {
    type: InteractionResponseType.UpdateMessage,
    data: {
      flags: MessageFlags.Ephemeral,
      content:
        `Created a leaderboard named **${input_name}**` +
        `\nDisplayed here: ${result.display_message_link}` +
        (result.matches_channel_link
          ? `\nMatches will be hosted in ${result.matches_channel_link}`
          : ''),
      components: [],
    },
  }
  return response
}

export async function onBtnDelete(ctx: ComponentContext<typeof leaderboards_cmd>, app: App) {
  assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
  const leaderboard = await getLeaderboardById(app.db, ctx.state.data.selected_leaderboard_id)

  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:delete confirm').encode(),
      title: `Do you want to delete "${leaderboard.data.name}"?`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              label: `Type "delete" to confirm`,
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
  ctx: ComponentContext<typeof leaderboards_cmd>,
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
    sentry.debug('deleted leaderboard')
    await ctx.editOriginal({
      flags: MessageFlags.Ephemeral,
      content: `Deleted **\`${input}\`** and all of its divisions, players, and matches`,
    })
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `Deleting **\`${input}\`** and all of its divisions, players, and matches`,
      components: [],
    },
  }
}
