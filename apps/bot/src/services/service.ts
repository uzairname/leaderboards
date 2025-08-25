import { awaitWithTimeout, safeStringify } from '@repo/utils'
import { Logger } from '../logging/logger'

export abstract class AppService {
  protected readonly logger: Logger
  constructor(options: { logger: Logger }) {
    this.logger = options.logger
  }
}

/**
 * Decorator that logs method calls in AppService classes.
 */
export function LogMethods<T extends new (...args: any[]) => AppService>(constructor: T) {
  const prototype = constructor.prototype

  // Get all method names from the prototype
  const methodNames = Object.getOwnPropertyNames(prototype).filter(
    name => name !== 'constructor' && typeof prototype[name] === 'function',
  )

  methodNames.forEach(methodName => {
    const originalMethod = prototype[methodName]

    prototype[methodName] = function (this: AppService, ...args: unknown[]) {
      const result = originalMethod.apply(this, args)

      // Check if the method returns a Promise (is async)
      if (result && typeof result.then === 'function') {
        this.logger.log({
          message: `${constructor.name}.${methodName} (${args.map(safeStringify)})`,
          category: 'appmethod',
          data: { args: safeStringify(args) },
        })

        const timeout_s = 10

        return awaitWithTimeout(
          result,
          () => {
            this.logger.log({
              message: `${constructor.name}.${methodName} taking longer than ${timeout_s}s`,
              category: 'appmethod',
              level: 'warning',
            })
          },
          timeout_s * 1000,
        )
      }

      return result
    }
  })

  return constructor
}
