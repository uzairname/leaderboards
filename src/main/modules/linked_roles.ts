import * as D from 'discord-api-types/v10'
import { App } from '../app/app'

export function getAppRoleConnectionsMetadata(
  app: App,
): D.RESTPutAPIApplicationRoleConnectionMetadataJSONBody {
  return [
    {
      type: D.ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
      key: 'elo',
      name: 'Elo Rating',
      description: 'Display elo on profile',
    },
  ]
}

/**
 *
 * @param bot
 * @param access_token
 * @param elo
 * @param platform_name Different for each user. Name of the ranking.
 */
export async function updateUserRoleConnectionData(
  app: App,
  access_token: string,
  elo: number,
  platform_name: string,
): Promise<void> {
  const body: D.RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name,
    metadata: {
      elo: elo.toFixed(0),
    },
  }

  await app.bot.updateUserRoleConnection(access_token, body)
}
