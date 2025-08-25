interface LaplaceResult {
  posterior: GaussianDistribution
  mode: number
  converged: boolean
  iterations: number
}

interface GaussianDistribution {
  mean: number
  variance: number
}

interface LaplaceOptions {
  initialGuess?: number
  tolerance?: number
  maxIterations?: number
  betaZeroGaussianVariance?: number // Variance for Gaussian likelihood when β = 0
}

/**
 * Sigmoid (logistic) function: 1/(1 + exp(-z))
 */
function sigmoid(z: number): number {
  // Numerically stable implementation
  if (z > 0) {
    const exp_neg_z = Math.exp(-z)
    return 1 / (1 + exp_neg_z)
  } else {
    const exp_z = Math.exp(z)
    return exp_z / (1 + exp_z)
  }
}


/**
 * Log-likelihood function
 */
function logLikelihood(alpha: number, beta: number, x: number, gaussianVariance: number = 1): number {
  if (beta === 0) {
    return -((x - alpha) ** 2) / (2 * gaussianVariance)
  } else {
    const z = Math.sign(beta) * (x - alpha)
    // Numerically stable log-sigmoid
    if (z > 0) {
      return -Math.log(1 + Math.exp(-z))
    } else {
      return z - Math.log(1 + Math.exp(z))
    }
  }
}

/**
 * First derivative of log-likelihood with respect to x
 * - If β ≠ 0: d/dx log L = sign(β) * sigmoid(-sign(β)(x - α))
 * - If β = 0: d/dx log L = -(x - α)/σ²
 */
function logLikelihoodDerivative(alpha: number, beta: number, x: number, gaussianVariance: number = 1): number {
  if (beta === 0) {
    return -(x - alpha) / gaussianVariance
  } else {
    const signBeta = Math.sign(beta)
    return signBeta * sigmoid(-signBeta * (x - alpha))
  }
}

/**
 * Second derivative of log-likelihood with respect to x
 * - If β ≠ 0: d²/dx² log L = -sigmoid(sign(β)(x - α)) * sigmoid(-sign(β)(x - α))
 * - If β = 0: d²/dx² log L = -1/σ²
 */
function logLikelihoodSecondDerivative(alpha: number, beta: number, x: number, gaussianVariance: number = 1): number {
  if (beta === 0) {
    return -1 / gaussianVariance
  } else {
    const signBeta = Math.sign(beta)
    const s1 = sigmoid(signBeta * (x - alpha))
    const s2 = sigmoid(-signBeta * (x - alpha))
    return -s1 * s2
  }
}

/**
 * Log-posterior function: log L(α, β, x) + log p(x)
 */
function logPosterior(
  alpha: number,
  beta: number,
  x: number,
  prior: GaussianDistribution,
  gaussianVariance: number = 1,
): number {
  const logL = logLikelihood(alpha, beta, x, gaussianVariance)
  const logPrior = -((x - prior.mean) ** 2) / (2 * prior.variance)
  return logL + logPrior
}

/**
 * First derivative of log-posterior with respect to x
 */
function logPosteriorDerivative(
  alpha: number,
  beta: number,
  x: number,
  prior: GaussianDistribution,
  gaussianVariance: number = 1,
): number {
  const logL_deriv = logLikelihoodDerivative(alpha, beta, x, gaussianVariance)
  const logPrior_deriv = -(x - prior.mean) / prior.variance
  return logL_deriv + logPrior_deriv
}

/**
 * Second derivative of log-posterior with respect to x
 */
function logPosteriorSecondDerivative(
  alpha: number,
  beta: number,
  x: number,
  prior: GaussianDistribution,
  gaussianVariance: number = 1,
): number {
  const logL_second_deriv = logLikelihoodSecondDerivative(alpha, beta, x, gaussianVariance)
  const logPrior_second_deriv = -1 / prior.variance
  return logL_second_deriv + logPrior_second_deriv
}

/**
 * Find the mode of the posterior distribution using Newton-Raphson method
 */
function findPosteriorMode(
  alpha: number,
  beta: number,
  prior: GaussianDistribution,
  options: LaplaceOptions = {},
): { mode: number; converged: boolean; iterations: number } {
  const {
    initialGuess,
    tolerance = 1e-8,
    maxIterations = 100,
    betaZeroGaussianVariance: gaussianVariance = 1,
  } = options

  let x = initialGuess ?? prior.mean // Start from prior mean if no initial guess
  let converged = false
  let iterations = 0

  for (let i = 0; i < maxIterations; i++) {
    const firstDeriv = logPosteriorDerivative(alpha, beta, x, prior, gaussianVariance)
    const secondDeriv = logPosteriorSecondDerivative(alpha, beta, x, prior, gaussianVariance)

    if (Math.abs(secondDeriv) < 1e-15) {
      // Second derivative too close to zero, can't continue
      break
    }

    const newX = x - firstDeriv / secondDeriv

    if (Math.abs(newX - x) < tolerance) {
      converged = true
      x = newX
      iterations = i + 1
      break
    }

    x = newX
    iterations = i + 1
  }

  return { mode: x, converged, iterations }
}

/**
 * Main function: Approximate the posterior distribution using Laplace approximation
 *
 * @param alpha - First observed value (center of sigmoid/Gaussian)
 * @param outcome - Second observed value (determines likelihood type)
 * @param prior - Gaussian prior distribution {mean, variance}
 * @param options - Optional parameters for optimization and Gaussian variance
 * @returns Gaussian approximation of the posterior distribution
 */
export function posteriorLaplaceApproximation(
  alpha: number,
  outcome: number,
  prior: GaussianDistribution,
  options: LaplaceOptions = {},
): LaplaceResult {
  const { betaZeroGaussianVariance: gaussianVariance = 1 } = options

  // Special case: When β = 0.0, we have two Gaussians - can solve analytically
  if (outcome === 0) {
    return analyticalGaussianPosterior(alpha, prior, gaussianVariance)
  }

  // General case: Use Newton-Raphson to find mode
  const modeResult = findPosteriorMode(alpha, outcome, prior, options)
  const mode = modeResult.mode

  // Compute the Hessian (second derivative) at the mode
  const hessian = logPosteriorSecondDerivative(alpha, outcome, mode, prior, gaussianVariance)

  // Posterior variance is the negative inverse of the Hessian
  const posteriorVariance = -1 / hessian

  return {
    posterior: {
      mean: mode,
      variance: posteriorVariance,
    },
    mode: mode,
    converged: modeResult.converged,
    iterations: modeResult.iterations,
  }
}

/**
 * Analytical solution when β = 0 (Gaussian prior × Gaussian likelihood)
 */
function analyticalGaussianPosterior(
  alpha: number,
  prior: GaussianDistribution,
  gaussianVariance: number,
): LaplaceResult {
  // When both prior and likelihood are Gaussian, the posterior is also Gaussian
  // with analytically computable mean and variance

  const priorPrecision = 1 / prior.variance
  const likelihoodPrecision = 1 / gaussianVariance

  const posteriorPrecision = priorPrecision + likelihoodPrecision
  const posteriorVariance = 1 / posteriorPrecision

  const posteriorMean = posteriorVariance * (priorPrecision * prior.mean + likelihoodPrecision * alpha)

  return {
    posterior: {
      mean: posteriorMean,
      variance: posteriorVariance,
    },
    mode: posteriorMean, // For Gaussian, mode = mean
    converged: true, // Analytical solution always converges
    iterations: 0, // No iterations needed
  }
}
