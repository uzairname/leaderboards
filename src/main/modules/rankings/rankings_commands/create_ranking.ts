import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  getModalSubmitEntries,
  StateContext,
  MessageView,
  field,
  _,
  AppCommand,
  InteractionContext,
} from '../../../../discord-framework'
import { sentry } from '../../../../request/sentry'
import { nonNullable } from '../../../../utils/utils'
import { App } from '../../../app/app'
import { Colors, escapeMd } from '../../../messages/message_pieces'
import { checkGuildInteraction, ensureAdminPerms } from '../../../views/utils/checks'
import { communityEnabled, getMatchLogsChannel, getOrAddGuild } from '../../guilds'
import { syncGuildRankingLbMessage } from '../../leaderboard/leaderboard_messages'
import { sendGuildRankingQueueMessage } from '../../matches/queue/queue_messages'
import { default_players_per_team, max_ranking_name_length } from '../manage_rankings'
import { default_num_teams } from '../manage_rankings'
import { createNewRankingInGuild, validateRankingOptions } from '../manage_rankings'
import { guildRankingSettingsPage, ranking_settings_page } from './ranking_settings'

export const createRankingCmd = (app: App) =>
  new AppCommand({
    name: 'create-ranking',
    type: D.ApplicationCommandType.ChatInput,
    description: 'Create a new ranking',
    options: [
      {
        name: 'name',
        description: 'Name of the ranking (you can rename later)',
        type: D.ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'num-teams',
        description: `Number of teams per match. Default ${default_num_teams}`,
        type: D.ApplicationCommandOptionType.Integer,
      },
      {
        name: 'players-per-team',
        description: `Number of players per team. Default ${default_players_per_team}`,
        type: D.ApplicationCommandOptionType.Integer,
      },
    ],
  }).onCommand(async ctx => {
    const options: { [key: string]: string } = {}
    ;(
      ctx.interaction.data.options as D.APIApplicationCommandInteractionDataStringOption[]
    )?.forEach(o => {
      options[o.name] = o.value
    })

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        return void ctx.followup(
          await createRankingPageData(app, {
            interaction: ctx.interaction,
            state: create_ranking_view_def.newState({
              input_name: options['name'],
              input_num_teams: options['num-teams'] ? parseInt(options['num-teams']) : undefined,
              input_players_per_team: options['players-per-team']
                ? parseInt(options['players-per-team'])
                : undefined,
            }),
          }),
        )
      },
    )
  })

export const create_ranking_view_def = new MessageView({
  custom_id_prefix: 'cr',
  name: 'rankings',
  state_schema: {
    from_page: field.Enum({
      creating_new: _,
    }),
    callback: field.Choice({
      createRankingPage,
      createRankingModal,
      onCreateRankingModalSubmit,
      onCreateConfirmBtn,
    }),
    input_name: field.String(),
    input_players_per_team: field.Int(),
    input_num_teams: field.Int(),
    leaderboard_message: field.Bool(),
    queue_message: field.Bool(),
    log_matches: field.Bool(),
  },
})

export const createRankingView = (app: App) =>
  create_ranking_view_def.onComponent(async ctx => {
    return ctx.state.get('callback')(app, ctx)
  })

export function createRankingModal(app: App, ctx: any): D.APIModalInteractionResponse {
  return {
    type: D.InteractionResponseType.Modal,
    data: {
      custom_id: ctx.state.set.callback(onCreateRankingModalSubmit).cId(),
      title: 'Create a new ranking',
      components: [
        rankingNameTextInput(ctx.state.data.input_name),
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              style: D.TextInputStyle.Short,
              custom_id: 'num_teams',
              label: 'Number of teams',
              placeholder: `${ctx.state.data.input_num_teams ?? default_num_teams}`,
              required: false,
            },
          ],
        },
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.TextInput,
              style: D.TextInputStyle.Short,
              custom_id: 'players_per_team',
              label: 'Players per team',
              placeholder: `${ctx.state.data.input_players_per_team ?? default_players_per_team}`,
              required: false,
            },
          ],
        },
      ],
    },
  }
}

export function onCreateRankingModalSubmit(
  app: App,
  ctx: ComponentContext<typeof create_ranking_view_def>,
): Promise<ChatInteractionResponse> {
  const modal_input = getModalSubmitEntries(ctx.interaction as D.APIModalSubmitInteraction)
  modal_input['name'].value && ctx.state.save.input_name(modal_input['name'].value)
  modal_input['num_teams'].value &&
    ctx.state.save.input_num_teams(parseInt(modal_input['num_teams'].value))
  modal_input['players_per_team'].value &&
    ctx.state.save.input_players_per_team(parseInt(modal_input['players_per_team'].value))

  return createRankingPage(app, ctx)
}

export async function createRankingPage(
  app: App,
  ctx: ComponentContext<typeof create_ranking_view_def>,
): Promise<ChatInteractionResponse> {
  const type = ctx.state.is.from_page('creating_new')
    ? // already on creating new page. Update message
      D.InteractionResponseType.UpdateMessage
    : // modal originated from another page. Create new message
      D.InteractionResponseType.ChannelMessageWithSource

  ctx.state.save.from_page('creating_new')

  return {
    type,
    data: await createRankingPageData(app, ctx),
  }
}

export async function createRankingPageData(
  app: App,
  ctx: InteractionContext<typeof create_ranking_view_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)

  ctx.state.save.from_page('creating_new')

  const { name, num_teams, players_per_team } = validateRankingOptions({
    name: ctx.state.get('input_name'),
    num_teams: ctx.state.data.input_num_teams || default_num_teams,
    players_per_team: ctx.state.data.input_players_per_team || default_players_per_team,
  })

  const leaderboard_message = ctx.state.data.leaderboard_message ?? true
  const queue_message = ctx.state.data.queue_message ?? true
  const log_matches = ctx.state.data.log_matches ?? true

  const match_results_channel_id = (await getMatchLogsChannel(app, guild.data.id))?.id

  const description = `## Making a New Ranking: *${escapeMd(name)}*`
    + `\n- Matches in this ranking will be **`
      + new Array(num_teams).fill(players_per_team).join('v') + `s**`
      + ` (${num_teams} teams and ${players_per_team} player` 
      + (players_per_team === 1 ? '' : 's') + ` per team)`
    + (leaderboard_message
      ? `\n- A **new channel** will be created where the leaderboard is displayed live`
      : ``)
    + (log_matches
      ? `\n- ` + (match_results_channel_id
        ? `Matches in this ranking will be logged in <#${match_results_channel_id}>`
        : `A new channel will be created where matches in this ranking are logged`)
      : ``)
    + (queue_message
      ? `\n- ` + (leaderboard_message
        ? `A message will be posted where players can join a matchmaking queue`
        : `A message will be posted in <#${nonNullable(ctx.interaction.channel, 'interaction channel').id}>`
          + ` where players can join a matchmaking queue`)
      : ``) // prettier-ignore

  const response: D.APIInteractionResponseCallbackData = {
    flags: D.MessageFlags.Ephemeral,
    embeds: [
      {
        description,
        color: Colors.EmbedBackground,
      },
    ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Primary,
            custom_id: ctx.state.set.callback(createRankingModal).cId(),
            label: 'Edit Name & Teams',
          },
          {
            type: D.ComponentType.Button,
            style: leaderboard_message ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
            label: leaderboard_message
              ? `Disable Leaderboard Display`
              : `Enable Leaderboard Display`,
            custom_id: ctx.state
              .setAll({
                callback: createRankingPage,
                leaderboard_message: !leaderboard_message,
              })
              .cId(),
          },
          {
            type: D.ComponentType.Button,
            style: log_matches ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
            label: log_matches ? `Disable Match Logging` : `Enable Match Logging`,
            custom_id: ctx.state
              .setAll({
                callback: createRankingPage,
                log_matches: !log_matches,
              })
              .cId(),
          },
          {
            type: D.ComponentType.Button,
            style: queue_message ? D.ButtonStyle.Primary : D.ButtonStyle.Secondary,
            label: (queue_message ? `Disable` : `Enable`) + ` Queue Message`,
            custom_id: ctx.state
              .setAll({
                callback: createRankingPage,
                queue_message: !queue_message,
              })
              .cId(),
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Success,
            custom_id: ctx.state
              .setAll({
                callback: onCreateConfirmBtn,
                leaderboard_message,
                log_matches,
                queue_message,
              })
              .cId(),
            label: 'Create Ranking',
          },
        ],
      },
    ],
  }
  return response
}

export function onCreateConfirmBtn(
  app: App,
  ctx: ComponentContext<typeof create_ranking_view_def>,
): ChatInteractionResponse {
  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      await ensureAdminPerms(app, ctx)
      const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)
      sentry.debug('ctx.state.data.leaderboard_message', ctx.state.data.leaderboard_message)
      const result = await createNewRankingInGuild(app, guild, {
        name: ctx.state.get('input_name'),
        num_teams: ctx.state.data.input_num_teams,
        players_per_team: ctx.state.data.input_players_per_team,
        display_settings: {
          log_matches: ctx.state.data.log_matches,
          leaderboard_message: ctx.state.data.leaderboard_message,
        },
      })
      await syncGuildRankingLbMessage(app, result.new_guild_ranking, true)
      if (ctx.state.data.queue_message) {
        await sendGuildRankingQueueMessage(
          app,
          result.new_guild_ranking,
          result.new_guild_ranking.data.leaderboard_channel_id ??
            nonNullable(ctx.interaction.channel, 'interaction channel').id,
        )
      }

      return ctx.edit(
        await guildRankingSettingsPage(app, {
          state: ranking_settings_page.newState({
            ranking_id: result.new_ranking.data.id,
            guild_id: guild.data.id,
            edit: true,
            ranking_name: result.new_ranking.data.name,
          }),
        }),
      )
    },
  )
}

export function rankingNameTextInput(
  existing_name?: string,
): D.APIActionRowComponent<D.APITextInputComponent> {
  const example_names = [
    `Smash 1v1`,
    `Starcraft 2v2`,
    `Valorant 5s`,
    `Chess`,
    `Ping Pong 1v1`,
    `Ranked Customs 2v2`,
    `Halo 8s`,
    `Chess`,
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
        placeholder:
          existing_name ??
          `e.g. ${example_names[Math.floor(Math.random() * example_names.length)]}`,
        max_length: max_ranking_name_length,
        required: !existing_name,
      },
    ],
  }
}
