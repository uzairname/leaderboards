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
  ApplicationCommandOptionType,
  APIInteractionResponseCallbackData,
  APIEmbed,
  APIEmbedField,
  APIModalSubmitInteraction,
} from 'discord-api-types/v10'

import {
  CommandInteractionResponse,
  ChatInteractionResponse,
  CommandContext,
  CommandView,
  ComponentContext,
  Context,
  ChoiceField,
  NumberField,
  StringField,
  BaseContext,
} from '../../../discord-framework'

import { assertValue } from '../../../utils/utils'

import { sentry } from '../../../logging/globals'

import { App } from '../../app'
import { UserErrors } from '../../errors'

import { checkMemberBotAdmin } from '../../modules/user_permissions'
import { getOrAddGuild } from '../../modules/guilds'
import { deleteRanking, createNewRankingInGuild, updateRanking } from '../../modules/rankings'

import { GuildRanking } from '../../../database/models'
import {
  Colors,
  commandMention,
  messageLink,
  relativeTimestamp,
  toMarkdown,
} from '../../messages/message_pieces'
import { checkGuildInteraction } from '../checks'

import { restore_cmd_def } from './restore'
import { rankingsAutocomplete } from '../common'
import { getModalSubmitEntries } from '../../../discord-framework'

const rankings_cmd_def = new CommandView({
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
        const selected_leaderboard_id = parseInt(selected_option)
        ctx.state.save.page('ranking settings').save.selected_ranking_id(selected_leaderboard_id)
        return {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: await leaderboardSettingsPage(app, ctx),
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
      if (!ctx.state.is.owner_id(ctx.interaction.member?.user.id)) {
        throw new UserErrors.NotComponentOwner(ctx.state.data.owner_id)
      }
      checkMemberBotAdmin(interaction.member, await getOrAddGuild(app, interaction.guild_id))

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
          return onRenameModalSubmit(ctx, app)
        }
      } else if (ctx.state.is.component('btn:create confirm')) {
        return await onCreateConfirm(ctx, app, interaction.guild_id)
      } else if (ctx.state.is.component('btn:delete')) {
        return await onBtnDelete(ctx, app)
      } else if (ctx.state.is.component('modal:delete confirm')) {
        return await onDeleteCorfirm(ctx, app)
      }

      // Page
      if (ctx.state.is.page('creating new')) {
        return creatingNewLeaderboardPage(ctx)
      } else if (ctx.state.is.page('ranking settings')) {
        return {
          type: InteractionResponseType.UpdateMessage,
          data: await leaderboardSettingsPage(app, ctx),
        }
      }

      throw new UserErrors.UnknownState(`${JSON.stringify(ctx.state.data)}`)
    })

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
        `${guild_rankings.length === 1 ? '' : 's'} in this server`,
      fields: [
        {
          name: `Helpful Commands`,
          value:
            `${await commandMention(app, rankings_cmd_def)} \`[name]\` - Manage a ranking\n` +
            `${await commandMention(
              app,
              restore_cmd_def,
            )} - Restore a ranking's channels or messages`,
        },
      ],
      color: Colors.EmbedBackground,
    },
  ]

  let fields: APIEmbedField[] = []

  await Promise.all(
    guild_rankings.map(async (item) => {
      fields.push({
        name: toMarkdown(item.ranking.data.name),
        value: await guildLeaderboardDetails(app, item.guild_ranking),
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

async function guildLeaderboardDetails(app: App, guild_leaderboard: GuildRanking): Promise<string> {
  // created time
  const created_time = (await guild_leaderboard.ranking()).data.time_created
  const created_time_msg = created_time
    ? `Created ${relativeTimestamp(created_time)}`
    : `Created ${relativeTimestamp(new Date())}`

  // display link
  if (guild_leaderboard.data.leaderboard_message_id) {
    const display_message_link = messageLink(
      guild_leaderboard.data.guild_id,
      guild_leaderboard.data.leaderboard_channel_id || '0',
      guild_leaderboard.data.leaderboard_message_id,
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

export async function leaderboardSettingsPage<Edit extends boolean>(
  app: App,
  ctx: BaseContext<typeof rankings_cmd_def>,
  edit: Edit = false as Edit,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)

  assertValue(ctx.state.data.selected_ranking_id, 'selected_leaderboard_id')
  const guild_leaderboard = await app.db.guild_rankings.get(
    interaction.guild_id,
    ctx.state.data.selected_ranking_id,
  )
  assertValue(guild_leaderboard, 'guild_leaderboard')
  const leaderboard = await guild_leaderboard.ranking()

  const embed = {
    title: leaderboard.data.name || 'Unnamed Leaderboard',
    description: await guildLeaderboardDetails(app, guild_leaderboard),
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
  app: App,
): Promise<ChatInteractionResponse> {
  assertValue(ctx.state.data.selected_ranking_id, 'selected_leaderboard_id')
  const leaderboard = await app.db.rankings.get(ctx.state.data.selected_ranking_id)
  const old_name = leaderboard.data.name
  await updateRanking(app, leaderboard, {
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
): ChatInteractionResponse {
  const response_type = InteractionResponseType.ChannelMessageWithSource

  const content = `Creating a new  named **${toMarkdown(ctx.state.data.input_name)}**`

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
  ctx.offload(async (ctx) => {
    let input_name = ctx.state.data.input_name
    assertValue(input_name, 'input_name')
    let guild = await getOrAddGuild(app, guild_id)
    let result = await createNewRankingInGuild(app, guild, {
      name: input_name,
    })
    ctx.state.save.page('ranking settings').save.selected_ranking_id(result.new_ranking.data.id)
    await ctx.editOriginal(await leaderboardSettingsPage(app, ctx))
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `Creating Ranking...`,
    },
  }
}

export async function onBtnDelete(ctx: ComponentContext<typeof rankings_cmd_def>, app: App) {
  assertValue(ctx.state.data.selected_ranking_id, 'selected_leaderboard_id')
  const leaderboard = await app.db.rankings.get(ctx.state.data.selected_ranking_id)

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
): Promise<ChatInteractionResponse> {
  let input = getModalSubmitEntries(ctx.interaction as APIModalSubmitInteraction).find(
    (c) => c.custom_id === 'name',
  )?.value

  assertValue(ctx.state.data.selected_ranking_id, 'selected_leaderboard_id')
  const leaderboard = await app.db.rankings.get(ctx.state.data.selected_ranking_id)

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
      content: `Deleted **\`${leaderboard.data.name}\`** and all of its players and matches`,
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
