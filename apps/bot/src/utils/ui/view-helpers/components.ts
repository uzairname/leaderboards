import { Ranking } from '@repo/db/models'
import * as D from 'discord-api-types/v10'

/**
 * Select menu of every ranking in a guild
 */
export function rankingSelectMenu(
  grs: { ranking: Ranking }[],
  custom_id: string,
): D.APIActionRowComponent<D.APIMessageActionRowComponent> {
  const ranking_select_menu_options: D.APISelectMenuOption[] = grs.map(gr => {
    return {
      label: gr.ranking.data.name,
      value: gr.ranking.data.id.toString(),
    }
  })

  return {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.StringSelect,
        custom_id,
        placeholder: `Select a ranking`,
        options: ranking_select_menu_options,
        min_values: 0,
      },
    ],
  }
}
