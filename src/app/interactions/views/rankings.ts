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
import { AppErrors, UserErrors } from '../../errors'

import { getOrAddGuild } from '../../modules/guilds'
import { deleteRanking, createNewRankingInGuild, updateRanking } from '../../modules/rankings'
import { default_num_teams } from '../../../database/models/models/rankings'
import { default_players_per_team } from '../../../database/models/models/rankings'

import { GuildRanking } from '../../../database/models'
import {
  Colors,
  commandMention,
  messageLink,
  relativeTimestamp,
  toMarkdown,
} from '../../messages/message_pieces'
import { checkInteractionMemberPerms } from '../checks'
import { checkGuildInteraction } from '../checks'

import { restore_cmd_def } from './restore'
import { rankingsAutocomplete } from '../common'
import { getModalSubmitEntries } from '../../../discord-framework'
import { help_command_def } from './help'

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
    input_players_per_team: new NumberField(),
    input_num_teams: new NumberField(),
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
        `You have **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}` +
        ` in this server`,
      fields: [],
      color: Colors.EmbedBackground,
    },
    {
      title: 'Helpful Commands',
      description:
        `${await commandMention(app, rankings_cmd_def)} **[name]** - Manage a ranking` +
        `\n${await commandMention(
          app,
          restore_cmd_def,
        )} - Restore or update missing channels and messages` +
        `\n${await commandMention(app, help_command_def)} - Help`,
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
    var display_message_msg = `${display_message_link}`
  } else {
    display_message_msg = `Not displayed in a message anywhere`
  }

  const description = `${display_message_msg}` + `\n${created_time_msg}`

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

export async function rankingSettingsPage<Edit extends boolean>(
  app: App,
  ctx: BaseContext<typeof rankings_cmd_def>,
  edit: Edit = false as Edit,
): Promise<APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)

  assertValue(ctx.state.data.selected_ranking_id, 'selected_ranking_id')
  const guild_ranking = await app.db.guild_rankings.get(
    interaction.guild_id,
    ctx.state.data.selected_ranking_id,
  )
  assertValue(guild_ranking, 'guild_ranking')
  const ranking = await guild_ranking.ranking()

  const embed: APIEmbed = {
    title: ranking.data.name || 'Unnamed Ranking',
    description: await guildRankingDetails(app, guild_ranking),
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
  app: App,
): Promise<ChatInteractionResponse> {
  assertValue(ctx.state.data.selected_ranking_id, 'selected_ranking_id')
  const ranking = await app.db.rankings.get(ctx.state.data.selected_ranking_id)
  const old_name = ranking.data.name

  await checkInteractionMemberPerms(app, ctx)
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
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
  ctx: ComponentContext<typeof rankings_cmd_def>,
  app: App,
  guild_id: string,
): Promise<ChatInteractionResponse> {
  ctx.offload(async (ctx) => {
    let input_name = ctx.state.data.input_name
    assertValue(input_name, 'input_name')

    const guild = await getOrAddGuild(app, guild_id)
    await checkInteractionMemberPerms(app, ctx, guild)

    let result = await createNewRankingInGuild(app, guild, {
      name: input_name,
    })
    ctx.state.save.page('ranking settings').save.selected_ranking_id(result.new_ranking.data.id)
    await ctx.editOriginal(await rankingSettingsPage(app, ctx))
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
  assertValue(ctx.state.data.selected_ranking_id, 'selected_ranking_id')
  const ranking = await app.db.rankings.get(ctx.state.data.selected_ranking_id)

  let response: APIModalInteractionResponse = {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.component('modal:delete confirm').encode(),
      title: `Delete ranking?`,
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              label: `Type "delete" to delete ${ranking.data.name}`.substring(0, 45),
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

  assertValue(ctx.state.data.selected_ranking_id, 'selected_ranking_id')
  const ranking = await app.db.rankings.get(ctx.state.data.selected_ranking_id)

  if (input?.toLowerCase() !== 'delete') {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        flags: MessageFlags.Ephemeral,
        content: `Didn't delete ${ranking.data.name}`,
      },
    }
  }

  ctx.offload(async (ctx) => {
    await checkInteractionMemberPerms(app, ctx)
    await deleteRanking(app.bot, ranking)

    await ctx.editOriginal({
      flags: MessageFlags.Ephemeral,
      content: `Deleted **\`${ranking.data.name}\`** and all of its players and matches`,
    })
  })

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      flags: MessageFlags.Ephemeral,
      content: `Deleting **${ranking.data.name}**...`,
      components: [],
    },
  }
}
