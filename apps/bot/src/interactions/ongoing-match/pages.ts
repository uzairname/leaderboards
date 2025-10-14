import {
  ActionRowBuilder,
  ButtonBuilder,
  ContainerBuilder,
  MessageActionRowComponentBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from '@discordjs/builders'
import { Context, MessageData } from '@repo/discord'
import { truncateString } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../setup/app'
import { onEnterRanksConfirm, onEnterRanksSubmit } from './handlers'
import { ongoing_match_view_sig } from './view'

export async function enterRanks(
  app: App,
  ctx: Context<typeof ongoing_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const match = await app.db.matches.fetch(ctx.state.get.match_id())
  const teams = await match.teams()

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `Please enter the order in which the teams finished, from first to last.`,
      }),
    )
    .addActionRowComponents(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
        new StringSelectMenuBuilder({
          custom_id: ctx.state.set.handler(onEnterRanksSubmit).cId(),
          options: teams.map((team, i) => {
            const is_solo = team.length === 1
            const team_name = truncateString(
              `${is_solo ? `` : `Team ${i + 1}: `}${team.map(p => p.player.data.name).join(', ')}`,
              30,
            )
            return {
              label: team_name,
              value: `${i}`,
            }
          }),
          max_values: teams.length,
          min_values: teams.length,
        }),
      ),
    )

  const submit_btn = new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
    new ButtonBuilder({
      custom_id: ctx.state.set.handler(onEnterRanksConfirm).cId(),
      label: 'Confirm',
      style: D.ButtonStyle.Success,
      disabled: !ctx.state.is.selected_team_ranks(),
      emoji: { name: '✅' },
    }),
  )

  return new MessageData({
    components: [container.toJSON(), submit_btn.toJSON()],
    flags: D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2,
  }).response_data
}

export async function enterPoints(
  app: App,
  ctx: Context<typeof ongoing_match_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const match = await app.db.matches.fetch(ctx.state.get.match_id())
  const teams = await match.teams()

  throw new Error('Not implemented')
}
