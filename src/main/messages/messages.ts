import { DiscordErrors, DiscordRESTClient } from '../../discord-framework'
import { inviteUrl } from './message_pieces'

export namespace Messages {
  export const concise_description =
    'This bot tracks Elo ratings for any game. Players can match against players of their skill level and record the results of their games. There are additional utilities for moderation, display, and statistics.'

  export const github_url = 'https://github.com/uzairname/leaderboards'

  export function botPermisssionsError(
    bot: DiscordRESTClient,
    e: DiscordErrors.BotPermissions
  ): string {
    let msg = "I'm missing some permissions"

    let missing_perms = e.getMissingPermissionsNames()

    if (missing_perms.length > 0) {
      msg = `I'm missing the following permissions: ${permsToString(missing_perms)}`
    }
    return msg + `\n[Click here to re-invite me with the required perms](${inviteUrl(bot)})`
  }

  export const no_rankings_description = `This server has no rankings. A ranking allows you to have ranked matches and leaderboards for a specific game.`
}

function permsToString(perms: string[]) {
  return perms
    .map(e =>
      e
        .toLowerCase()
        .split('_')
        .map(e => e.charAt(0).toUpperCase() + e.slice(1))
        .join(' ')
    )
    .join(', ')
}
