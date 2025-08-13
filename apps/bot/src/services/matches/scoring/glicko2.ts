type GlickoParams = {
  glicko_scale: number
  default_rating: number
  tau: number
}

export type MatchResult = 1 | 0.5 | 0

/** The convergence tolerance for the iterative algorithm in step 5. */
const CONVERGENCE_TOLERANCE = 0.000001

type Player = {
  rating: number
  rd: number
  vol: number
}

type Glicko2Player = {
  readonly mu: number
  readonly phi: number
  readonly vol: number
}

// --- Internal Helper Functions ---

/** Step 2: Convert a player's rating and RD to the Glicko-2 scale. */
const toGlicko2Scale = (player: Player, params: GlickoParams): Glicko2Player => ({
  mu: (player.rating - params.default_rating) / params.glicko_scale,
  phi: player.rd / params.glicko_scale,
  vol: player.vol,
})

/** Step 8: Convert a player's Glicko-2 scaled parameters back to the original scale. */
const fromGlicko2Scale = (g2p: Glicko2Player, params: GlickoParams): Player => ({
  rating: g2p.mu * params.glicko_scale + params.default_rating,
  rd: g2p.phi * params.glicko_scale,
  vol: g2p.vol,
})

/** The Glicko-2 `g` function, which is used in multiple calculations. */
const g = (phi: number): number => {
  return 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2)
}

/** The Glicko-2 `E` function, which calculates the expected score of a player against an opponent. */
const E = (mu: number, mu_j: number, phi_j: number): number => {
  const g_phi_j = g(phi_j)
  return 1 / (1 + Math.exp(-g_phi_j * (mu - mu_j)))
}

/** Step 3: Compute the estimated variance `v` of the player's rating based on match outcomes. */
const calculateV = (playerMu: number, opponentMu: number, opponentPhi: number): number => {
  const E_val = E(playerMu, opponentMu, opponentPhi)
  const g_phi_j = g(opponentPhi)
  // For a single match, the sum is just one term
  const v_inv = g_phi_j ** 2 * E_val * (1 - E_val)
  return 1 / v_inv
}

/** Step 4: Compute the estimated improvement in rating, `Δ`. */
const calculateDelta = (
  v: number,
  score: number,
  playerMu: number,
  opponentMu: number,
  opponentPhi: number,
): number => {
  const E_val = E(playerMu, opponentMu, opponentPhi)
  const g_phi_j = g(opponentPhi)
  // For a single match, the sum is just one term
  return v * g_phi_j * (score - E_val)
}

const calculateNewVolatility = (
  playerPhi: number,
  playerVol: number,
  delta: number,
  v: number,
  tau: number,
): number => {
  const a = Math.log(playerVol ** 2)
  const delta_sq = delta ** 2
  const phi_sq = playerPhi ** 2

  const f = (x: number): number => {
    const e_x = Math.exp(x)
    const term1 = e_x * (delta_sq - phi_sq - v - e_x)
    const term2 = 2 * (phi_sq + v + e_x) ** 2
    const term3 = (x - a) / tau ** 2
    return term1 / term2 - term3
  }

  let A = a
  let B: number

  if (delta_sq > phi_sq + v) {
    B = Math.log(delta_sq - phi_sq - v)
  } else {
    let k = 1
    while (f(a - k * tau) < 0) {
      k++
    }
    B = a - k * tau
  }

  let fA = f(A)
  let fB = f(B)

  // Illinois method for root-finding
  while (Math.abs(B - A) > CONVERGENCE_TOLERANCE) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)

    if (fC * fB < 0) {
      A = B
      fA = fB
    } else {
      fA /= 2
    }
    B = C
    fB = fC
  }

  return Math.exp(A / 2)
}

/**
 * Calculates the new Glicko-2 ratings for two players after a single match,
 * accounting for the number of rating periods since each player last competed.
 *
 * @param player1 The first player's Glicko-2 data.
 * @param player2 The second player's Glicko-2 data.
 * @param result The result of the match from player1's perspective.
 * @param inactivePeriodsP1 The number of rating periods player 1 has missed since their last match. Defaults to 0.
 * @param inactivePeriodsP2 The number of rating periods player 2 has missed since their last match. Defaults to 0.
 * @returns An object containing the updated Player data for both players.
 */
export const calculateNewGlickoRatings = (
  player1: Player,
  player2: Player,
  result: MatchResult,
  inactivePeriodsP1: number = 0,
  inactivePeriodsP2: number = 0,
  params: GlickoParams,
): { player1: Player; player2: Player } => {
  /**
   * Applies the Glicko-2 rating deviation increase for inactive periods.
   * For each missed period, RD increases according to the formula: RD' = sqrt(RD^2 + σ^2).
   */
  const applyInactivity = (player: Player, periods: number): Player => {
    if (periods <= 0) {
      return player
    }
    const g2p = toGlicko2Scale(player, params)
    // For 't' periods, the formula is: φ' = sqrt(φ^2 + t * σ^2)
    const newPhi = Math.sqrt(g2p.phi ** 2 + periods * g2p.vol ** 2)
    // Return a new player object with the updated RD (from phi)
    return fromGlicko2Scale({ ...g2p, phi: newPhi }, params)
  }

  // Update each player's RD based on their inactivity.
  const p1_after_inactivity = applyInactivity(player1, inactivePeriodsP1)
  const p2_after_inactivity = applyInactivity(player2, inactivePeriodsP2)

  /** Processes a single player's rating update for one match. */
  const processSinglePlayer = (player: Player, opponent: Player, score: number): Player => {
    const g2Player = toGlicko2Scale(player, params)
    const g2Opponent = toGlicko2Scale(opponent, params)
    const v = calculateV(g2Player.mu, g2Opponent.mu, g2Opponent.phi)
    const delta = calculateDelta(v, score, g2Player.mu, g2Opponent.mu, g2Opponent.phi)
    const newVol = calculateNewVolatility(g2Player.phi, g2Player.vol, delta, v, params.tau)
    const preRatingPhi = Math.sqrt(g2Player.phi ** 2 + newVol ** 2)
    const newPhi = 1 / Math.sqrt(1 / preRatingPhi ** 2 + 1 / v)
    const newMu = g2Player.mu + newPhi ** 2 * (delta / v)
    return fromGlicko2Scale({ mu: newMu, phi: newPhi, vol: newVol }, params)
  }

  // Then, calculate the results of the match using the adjusted player data.
  const newPlayer1 = processSinglePlayer(p1_after_inactivity, p2_after_inactivity, result)
  const newPlayer2 = processSinglePlayer(p2_after_inactivity, p1_after_inactivity, 1 - result)

  return { player1: newPlayer1, player2: newPlayer2 }
}
