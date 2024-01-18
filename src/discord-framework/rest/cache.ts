import * as D from 'discord-api-types/v10'

export class DiscordCache {
  constructor() {}
  guild_channels: Record<string, D.APIChannel[]> = {}
}
