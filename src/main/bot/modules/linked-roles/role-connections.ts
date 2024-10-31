import * as D from 'discord-api-types/v10'
import { App } from '../../../app/App'

export function getAppRoleConnectionsMetadata(
  app: App,
): D.RESTPutAPIApplicationRoleConnectionMetadataJSONBody {
  return [
    {
      type: D.ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
      key: 'elo',
      name: 'Elo Rating',
      description: 'At least this elo rating (leave 0 for no minimum)',
    },
  ]
}

/**
 *
 * @param bot
 * @param access_token
 * @param elo
 * @param ranking_name Different for each user. Name of the ranking.
 */
export async function updateUserRoleConnectionData(
  app: App,
  access_token: string,
  elo: number,
  ranking_name: string,
): Promise<void> {
  const body: D.RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name: ranking_name,
    metadata: {
      elo: elo.toFixed(0),
    },
  }

  await app.discord.updateUserRoleConnection(access_token, body)
}
