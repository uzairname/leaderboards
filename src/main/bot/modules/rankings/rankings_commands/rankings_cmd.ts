import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../discord-framework'
import { App } from '../../../../app-context/app-context'
import {
  create_choice_value,
  guildRankingsOptionChoices,
} from '../../../components/command_helpers'
import { checkGuildInteraction } from '../../../perms'
import { CustomView } from '../../../view_manager/view_module'
import { allGuildRankingsPage } from './all_rankings'
import {
  createRankingCmd,
  createRankingModal,
  createRankingView,
  create_ranking_view_definition,
} from './create_ranking'
import {
  guildRankingSettingsPage,
  rankingSettingsView,
  ranking_settings_page,
} from './ranking_settings'

export const rankings_cmd_def = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'r',
  name: 'rankings',
  description: 'Create and manage rankings and leaderboards',
})

const ranking_option_name = 'ranking'

const rankingsCommandDef = async (app: App, guild_id: string) =>
  new AppCommand({
    ...rankings_cmd_def.options,
    options: [
      {
        type: D.ApplicationCommandOptionType.String,
        name: ranking_option_name,
        description: 'Select a ranking or create a new one',
        choices: await guildRankingsOptionChoices(app, guild_id, true),
      },
    ],
  })

const rankingsCommand = (app: App) => {
  return rankings_cmd_def
    .onCommand(async ctx => {
      const ranking_option_value = (
        ctx.interaction.data.options?.find(o => o.name === ranking_option_name) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (ranking_option_value === create_choice_value) {
        return createRankingModal(app, { state: create_ranking_view_definition.newState() })
      }

      if (ranking_option_value) {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: {
              flags: D.MessageFlags.Ephemeral,
            },
          },
          async ctx => {
            const ranking = await app.db.rankings.get(parseInt(ranking_option_value))
            return void ctx.edit(
              await guildRankingSettingsPage(app, {
                state: ranking_settings_page.newState({
                  ranking_id: ranking.data.id,
                  guild_id: checkGuildInteraction(ctx.interaction).guild_id,
                  ranking_name: ranking.data.name,
                }),
              }),
            )
          },
        )
      } else {
        return ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => ctx.edit(await allGuildRankingsPage(app, ctx)),
        )
      }
    })

    .onComponent(async ctx => {
      return ctx.defer(
        {
          type: D.InteractionResponseType.DeferredMessageUpdate,
        },
        async ctx => ctx.edit(await allGuildRankingsPage(app, ctx)),
      )
    })
}

export const manage_rankings_module = [
  new CustomView(createRankingCmd),
  new CustomView(createRankingView),
  new CustomView(rankingSettingsView),
  new CustomView(rankingsCommand, rankingsCommandDef),
]
