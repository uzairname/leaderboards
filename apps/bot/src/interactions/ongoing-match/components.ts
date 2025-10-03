import { ActionRowBuilder, ContainerBuilder, MessageActionRowComponentBuilder, ModalActionRowComponentBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder } from '@discordjs/builders'
import { MatchPlayer } from '@repo/db/models'
import { Context, MessageData } from '@repo/discord'
import { truncateString } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { ongoing_match_view_sig } from './view'
import { App } from '../../setup/app'
import { onEnterPointsModalSubmit } from './handlers'

export async function matchTeamPointsModal(app: App, ctx: Context<typeof ongoing_match_view_sig>) {

  const match = await app.db.matches.fetch(ctx.state.get.match_id())
  const teams = await match.teams()

  if (teams.length > 5) {
    throw new Error('Too many teams to enter points in a modal')
  }

  console.log(teams)

  const modal = new ModalBuilder({
    title: 'Enter Team Points',
    custom_id: ctx.state.set.handler(onEnterPointsModalSubmit).cId()
  })

  .addComponents(
    teams.map((team, i) => {
      const is_solo = team.length === 1
      const team_name = truncateString(`${is_solo ? `player` : `team`} ${i + 1}: ${team.map(p => p.player.data.name).join(', ')}`, 30)

      return new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
        new TextInputBuilder({
          type: D.ComponentType.TextInput,
          custom_id: `${i}`,
          style: D.TextInputStyle.Short,
          label: `${team_name}`,
          placeholder: `Enter points accrued`,
        }),
      )
    }),
  )

  return modal.toJSON()
}

