import { Player } from '@repo/db/models'

/**
 * Info about a player in a ranking to display
 */
export type PlayerDisplay = {
  player: Player
  points: number
  is_provisional?: boolean
}
