import { RequestMethod } from '@discordjs/rest'
import { PermissionFlagsBits } from 'discord-api-types/v10'

function requiredGuildPermissions(method: RequestMethod, route: `/${string}`) {
  switch (true) {
    case /^\/channels\d+$/.test(route):
      switch (method) {
        case RequestMethod.Patch:
          return PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageThreads
        case RequestMethod.Delete:
          return PermissionFlagsBits.ManageChannels
      }

    case /^\/channels\/\d+\/messages\/\d+$/.test(route):

    case /^\/guilds\/\d+\/channels$/.test(route):
      switch (method) {
        case RequestMethod.Post:
          return PermissionFlagsBits.ManageChannels
        case RequestMethod.Patch:
          return PermissionFlagsBits.ManageChannels
        case RequestMethod.Delete:
          return PermissionFlagsBits.ManageChannels
      }
    case /^\/guilds\/\d+$/.test(route):
      switch (method) {
        case RequestMethod.Patch:
          return PermissionFlagsBits.ManageGuild
      }
  }
  return 0n
}
