import {
  ApplicationRoleConnectionMetadataType,
  RESTPutAPIApplicationRoleConnectionMetadataJSONBody,
  RESTPutAPICurrentUserApplicationRoleConnectionJSONBody,
} from 'discord-api-types/v10'
import { DiscordRESTClient } from '../../discord/rest/client'
import { config } from '../../utils/globals'

export function getAppRoleConnectionsMetadata(): RESTPutAPIApplicationRoleConnectionMetadataJSONBody {
  return config.features.ROLE_CONNECTIONS_METADATA
    ? [
        {
          key: 'elorating',
          name: 'Elo Rating',
          description: 'Points must be greater than',
          type: ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
        },
      ]
    : []
}

export async function updateUserRoleConnectionData(
  bot: DiscordRESTClient,
  access_token: string,
  score: number,
  platform_name: string,
): Promise<void> {
  const body: RESTPutAPICurrentUserApplicationRoleConnectionJSONBody = {
    platform_name,
    metadata: {
      score: score,
    },
  }

  if (config.features.ROLE_CONNECTIONS_METADATA) {
    await bot.updateUserRoleConnection(access_token, body)
  }
}
