import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  AppCommand,
  ComponentContext,
  InteractionContext,
  field,
} from '../../../discord-framework'
import { App } from '../../app/app'
import { Colors } from '../../messages/message_pieces'
import { match_history_view_def } from '../../modules/match_logging/matches_view'
import { ViewModule, globalView } from '../../modules/view_manager/view_module'
import { checkGuildInteraction } from '../utils/checks'

const option_names = {
  user: 'user',
}

export const stats_cmd = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'st',
  name: 'stats',
  description: `View a player's stats`,
  options: [
    {
      name: option_names.user,
      description: 'Leave blank to view your own stats',
      type: D.ApplicationCommandOptionType.User,
    },
  ],
  state_schema: {
    callback: field.Choice({
      mainPage,
    }),
    user_id: field.String(),
    selected_ranking_id: field.Int(),
  },
})

export const statsCmd = (app: App) =>
  stats_cmd
    .onCommand(async ctx => {
      const user_option_value = (
        ctx.interaction.data.options?.find(o => o.name === option_names.user) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      ctx.state.save.user_id(
        user_option_value ?? checkGuildInteraction(ctx.interaction).member.user.id,
      )

      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredChannelMessageWithSource,
          data: {
            flags: D.MessageFlags.Ephemeral,
          },
        },
        async ctx => {
          return void ctx.edit(await mainPageData(app, ctx))
        },
      )
    })
    .onComponent(async ctx => {
      return await ctx.state.get.callback()(app, ctx)
    })

async function mainPageData(
  app: App,
  ctx: InteractionContext<typeof stats_cmd>,
): Promise<D.APIInteractionResponseCallbackData> {
  const user_id = ctx.state.get.user_id()
  const discord_user = await app.bot.getUser(user_id)

  // find all of the user's players that are in a ranking that the guild has
  const guild_rankings = await app.db.guild_rankings.get({
    guild_id: checkGuildInteraction(ctx.interaction).guild_id,
  })
  const players = (await app.db.players.getByUser(user_id)).filter(p =>
    guild_rankings.some(r => r.ranking.data.id === p.data.ranking_id),
  )

  const embed: D.APIEmbed = {
    title: `${discord_user.global_name ?? discord_user.username}'s Stats`,
    fields:
      (await Promise.all(
        players.map(async p => {
          const ranking = await p.ranking
          return {
            name: ranking.data.name ?? 'Unnamed Ranking',
            value: `Score: ${p.data.rating?.toFixed(0) ?? 'Unranked'}`,
          }
        }),
      )) ?? `No data`,
    color: Colors.EmbedBackground,
  }

  return {
    embeds: [embed],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: `Matches`,
            style: D.ButtonStyle.Primary,
            custom_id: match_history_view_def
              .newState({
                ranking_ids: ctx.state.data.selected_ranking_id
                  ? [ctx.state.data.selected_ranking_id]
                  : players.map(p => p.data.ranking_id),
                player_ids: players.map(p => p.data.id),
              })
              .cId(),
          },
        ],
      },
    ],
  }
}

async function mainPage(
  app: App,
  ctx: ComponentContext<typeof stats_cmd>,
): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await mainPageData(app, ctx),
  }
}
