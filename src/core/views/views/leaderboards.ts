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

import { CommandInteractionResponse, ChatInteractionResponse } from '../../../discord/views/types'
import {
  AutocompleteContext,
  CommandContext,
  CommandView,
  ComponentContext,
} from '../../../discord/views/views'
import { ChoiceField, NumberField, StringField } from '../../../discord/views/string_data'

import { assertNonNullable } from '../../../utils/utils'
import { config } from '../../../utils/globals'

import { App } from '../../app'
import { AppErrors, Errors } from '../../errors'

import { channelMention, commandMention } from '../../helpers/messages/message_pieces'
import { checkGuildInteraction } from '../../helpers/checks'

import { getOrAddGuild } from '../../modules/guilds'
import {
  getLeaderboardById,
  deleteLeaderboard,
  createNewLeaderboardInGuild,
} from '../../modules/leaderboards'

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
    latest_page: new ChoiceField({
      main: null,
      'lb settings': undefined,
      'creating new': undefined,
    }),
    component: new ChoiceField({
      'btn:create': null,
      'modal:create': null,
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

    .onCommand((ctx) => initLeaderboardsCommand(ctx, app))

    .onComponent(async (ctx) => {
      const interaction = checkGuildInteraction(ctx.interaction)

      if (!ctx.state.is.owner_id(ctx.interaction.member?.user.id)) {
        throw new AppErrors.NotComponentOwner(ctx.state.data.owner_id)
      }

      if (ctx.state.is.component('btn:create')) {
        return createLeaderboardModal(ctx)
      } else if (ctx.state.is.component('modal:create')) {
        return await onModalCreate(ctx)
      } else if (ctx.state.is.component('select:queue type')) {
        return onSelectType(ctx)
      } else if (ctx.state.is.component('btn:create confirm')) {
        return await onCreateConfirm(ctx, app, interaction.guild_id)
      } else if (ctx.state.is.component('btn:delete')) {
        return await onBtnDelete(ctx, app)
      } else if (ctx.state.is.component('modal:delete confirm')) {
        return await onDeleteCorfirm(ctx, app, ctx.modal_entries)
      } else {
        throw new Errors.UnknownState(ctx.state.data.component)
      }
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

export async function initLeaderboardsCommand(
  ctx: CommandContext<typeof leaderboards_cmd>,
  app: App,
) {
  const interaction = checkGuildInteraction(ctx.interaction)
  ctx.state.save.owner_id(interaction.member.user.id)

  let selected_option = (
    interaction.data.options?.find((o) => o.name === 'leaderboard') as
      | APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  if (selected_option === 'create') {
    return createLeaderboardModal(ctx)
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
    return await leaderboardOptionsPage(ctx)
  } else {
    return await allGuildLeaderboardsPage(ctx, app, interaction.guild_id)
  }
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

export async function leaderboardOptionsPage(
  ctx: CommandContext<typeof leaderboards_cmd>,
): Promise<CommandInteractionResponse> {
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
              style: ButtonStyle.Primary,
              custom_id: ctx.state.set.component('btn:delete').encode(),
              label: 'Delete',
            },
          ],
        },
      ],
    },
  }
}

export function createLeaderboardModal(
  ctx: CommandContext<typeof leaderboards_cmd> | ComponentContext<typeof leaderboards_cmd>,
): CommandInteractionResponse {
  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:create').encode(),
      title: 'Create a New Leaderboard',
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              style: TextInputStyle.Short,
              custom_id: 'name',
              label: 'Leaderboard name',
              placeholder: 'e.g. Smash 1v1',
            },
          ],
        },
      ],
    },
  }
  return response
}

export async function onModalCreate(
  ctx: ComponentContext<typeof leaderboards_cmd>,
): Promise<ChatInteractionResponse> {
  let new_lb_name = ctx.modal_entries?.find((c) => c.custom_id === 'name')?.value
  assertNonNullable(new_lb_name, 'new_lb_name')
  ctx.state.save.input_name(new_lb_name)
  return creatingNewLeaderboardPage(ctx)
}

export function onSelectType(
  ctx: ComponentContext<typeof leaderboards_cmd>,
): ChatInteractionResponse {
  let data = ctx.interaction.data as APIMessageStringSelectInteractionData
  ctx.state.save.selected_type(data.values[0] === 'simple' ? 'simple' : '1v1')
  return creatingNewLeaderboardPage(ctx)
}

export function creatingNewLeaderboardPage(
  ctx: ComponentContext<typeof leaderboards_cmd>,
): ChatInteractionResponse {
  const response_type = ctx.state.is.latest_page('creating new')
    ? InteractionResponseType.UpdateMessage
    : InteractionResponseType.ChannelMessageWithSource

  ctx.state.save.latest_page('creating new')

  assertNonNullable(ctx.state.data.input_name, 'input_name')
  const content =
    config.env.ENVIRONMENT === 'development'
      ? `Creating a new leaderboard named **${ctx.state.data.input_name}**\n\nLeaderboard type:`
      : `Creating a new leaderboard named **${ctx.state.data.input_name}**`

  const components: APIActionRowComponent<APIMessageActionRowComponent>[] =
    config.env.ENVIRONMENT == 'development'
      ? [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: ctx.state.set.component('select:queue type').encode(),
                placeholder: 'Leaderboard Type',
                max_values: 1,
                options: [
                  {
                    label: 'Simple',
                    value: 'simple',
                    default: ctx.state.data.selected_type === 'simple',
                  },
                  {
                    label: 'With 1v1 Queue',
                    value: '1v1',
                    default: ctx.state.data.selected_type === '1v1',
                  },
                ],
              },
            ],
          },
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
      : [
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
  let selected_type = ctx.state.data.selected_type ?? 'simple'
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
        `Created a ${selected_type} leaderboard named **${input_name}**` +
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
  const leaderboard_name = (
    await getLeaderboardById(app.db, ctx.state.data.selected_leaderboard_id)
  ).data.name

  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:delete confirm').encode(),
      title: 'Delete Leaderboard',
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              label: `Type ${leaderboard_name} to confirm`,
              placeholder: `${leaderboard_name}`,
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
  let input_leaderboard_name = modal_entries?.find((c) => c.custom_id === 'name')?.value

  if (
    input_leaderboard_name?.toLowerCase() !==
    ctx.state.data.selected_leaderboard_name?.toLowerCase()
  ) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: `Name didn't match. Didn't delete ${ctx.state.data.selected_leaderboard_name}`,
      },
    }
  }

  ctx.offload(async (ctx) => {
    assertNonNullable(ctx.state.data.selected_leaderboard_id, 'selected_leaderboard_id')
    let leaderboard = await getLeaderboardById(app.db, ctx.state.data.selected_leaderboard_id)
    await deleteLeaderboard(app.bot, leaderboard)
    await ctx.editOriginal({
      flags: MessageFlags.Ephemeral,
      content: `Deleted **\`${input_leaderboard_name}\`** and all of its divisions, players, and matches`,
    })
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `Deleting **\`${input_leaderboard_name}\`** and all of its divisions, players, and matches`,
      components: [],
    },
  }
}
