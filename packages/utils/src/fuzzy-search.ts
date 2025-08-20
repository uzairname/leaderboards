interface FuzzyMatch {
  score: number
  matches: number[]
  original: string
}

interface FuzzySearchOptions {
  caseSensitive?: boolean
  threshold?: number
  maxResults?: number
}

class FuzzyMatcher {
  private options: Required<FuzzySearchOptions>

  constructor(options: FuzzySearchOptions = {}) {
    this.options = {
      caseSensitive: false,
      threshold: 0.3,
      maxResults: 10,
      ...options,
    }
  }

  /**
   * Calculate fuzzy match score between query and target string
   * Returns score (0-1, higher is better) and match positions
   */
  match(query: string, target: string): FuzzyMatch | null {
    if (!query || !target) return null

    const normalizedQuery = this.options.caseSensitive ? query : query.toLowerCase()
    const normalizedTarget = this.options.caseSensitive ? target : target.toLowerCase()

    const matches: number[] = []
    let queryIndex = 0
    let targetIndex = 0
    let consecutiveMatches = 0
    let maxConsecutive = 0

    // Find matching characters
    while (queryIndex < normalizedQuery.length && targetIndex < normalizedTarget.length) {
      if (normalizedQuery[queryIndex] === normalizedTarget[targetIndex]) {
        matches.push(targetIndex)
        queryIndex++
        consecutiveMatches++
        maxConsecutive = Math.max(maxConsecutive, consecutiveMatches)
      } else {
        consecutiveMatches = 0
      }
      targetIndex++
    }

    // If not all query characters were found, no match
    if (queryIndex < normalizedQuery.length) {
      return null
    }

    // Calculate score based on various factors
    const score = this.calculateScore(query, target, matches, maxConsecutive, normalizedQuery, normalizedTarget)

    return score >= this.options.threshold ? { score, matches, original: target } : null
  }

  /**
   * Search through an array of strings and return ranked results
   */
  search(query: string, items: string[]): FuzzyMatch[] {
    if (!query.trim()) return []

    const results: FuzzyMatch[] = []

    for (const item of items) {
      const match = this.match(query, item)
      if (match) {
        results.push(match)
      }
    }

    // Sort by score (descending) and take top results
    return results.sort((a, b) => b.score - a.score).slice(0, this.options.maxResults)
  }

  /**
   * Search through an array of objects by a specific property
   */
  searchObjects<T>(query: string, items: T[], keyExtractor: (item: T) => string): Array<FuzzyMatch & { item: T }> {
    if (!query.trim()) return []

    const results: Array<FuzzyMatch & { item: T }> = []

    for (const item of items) {
      const searchText = keyExtractor(item)
      const match = this.match(query, searchText)
      if (match) {
        results.push({ ...match, item })
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, this.options.maxResults)
  }

  private calculateScore(
    query: string,
    target: string,
    matches: number[],
    maxConsecutive: number,
    normalizedQuery: string,
    normalizedTarget: string,
  ): number {
    const queryLen = query.length
    const targetLen = target.length

    // Base score: ratio of matched characters
    let score = matches.length / queryLen

    // Bonus for shorter targets (more specific matches)
    score += (1 / targetLen) * 0.1

    // Bonus for consecutive character matches
    score += (maxConsecutive / queryLen) * 0.2

    // Bonus for matches at word boundaries
    const wordBoundaryBonus = this.calculateWordBoundaryBonus(target, matches)
    score += wordBoundaryBonus * 0.3

    // Bonus for matches at the beginning of the string
    const startBonus = matches[0] === 0 ? 0.1 : 0
    score += startBonus

    // Penalty for gaps between matches
    const gapPenalty = this.calculateGapPenalty(matches, targetLen)
    score -= gapPenalty * 0.1

    // Exact substring bonus
    if (normalizedTarget.includes(normalizedQuery)) {
      score += 0.5
    }

    return Math.min(score, 1) // Cap at 1.0
  }

  private calculateWordBoundaryBonus(target: string, matches: number[]): number {
    let bonus = 0
    for (const pos of matches) {
      if (pos === 0 || /\s/.test(target[pos - 1]) || /[A-Z]/.test(target[pos])) {
        bonus += 0.1
      }
    }
    return bonus
  }

  private calculateGapPenalty(matches: number[], targetLength: number): number {
    if (matches.length <= 1) return 0

    let totalGap = 0
    for (let i = 1; i < matches.length; i++) {
      totalGap += matches[i] - matches[i - 1] - 1
    }

    return totalGap / targetLength
  }
}

// Utility function for simple fuzzy search
export function fuzzySearch(query: string, items: string[], options?: FuzzySearchOptions): string[] {
  const matcher = new FuzzyMatcher(options)
  return matcher.search(query, items).map(result => result.original)
}

export { FuzzyMatch, FuzzyMatcher, FuzzySearchOptions }
