import { ActionRowBuilder, ModalActionRowComponentBuilder, ModalBuilder, TextInputBuilder } from '@discordjs/builders'
import { MatchPlayer } from '@repo/db/models'
import { truncateString } from '@repo/utils'
import * as D from 'discord-api-types/v10'

export async function matchTeamPointsModal(teams: MatchPlayer[][]) {
  if (teams.length > 5) {
    throw new Error('Too many teams to enter points in a modal')
  }
  const modal = new ModalBuilder().addComponents(
    teams.map((team, i) => {
      const team_name = truncateString(`Team ${i + 1}: ${team.map(p => p.player.data.name).join(', ')}`, 30)

      return new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
        new TextInputBuilder({
          type: D.ComponentType.TextInput,
          custom_id: `${i}`,
          style: D.TextInputStyle.Short,
          label: `Points for ${team_name}`,
        }),
      )
    }),
  )

  return modal.toJSON()
}
