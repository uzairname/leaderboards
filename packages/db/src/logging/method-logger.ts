import { safeStringify } from '@repo/utils'
import { DbLogger } from './db-logger'

export function logDbMethods(target: Function) {
  const propertyNames = Object.getOwnPropertyNames(target.prototype)
  propertyNames.forEach(propertyName => {
    if (propertyName === 'constructor') return

    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyName)
    if (descriptor && typeof descriptor.value === 'function') {
      const method = descriptor.value

      descriptor.value = function (...args: unknown[]) {
        const result = method.apply(this, args)

        // Check if the result is a Promise
        if (result && typeof result.then === 'function') {
          const logger = (this as any).db?.logger as DbLogger | undefined
          const className = target.name

          if (logger) {
            const start = performance.now()
            let startLogged = false

            // Create a delayed start log promise
            const startLog = new Promise<'timeout'>(resolve => {
              setTimeout(() => {
                if (!startLogged) {
                  startLogged = true
                  logger.log({
                    message: `Starting execution: ${className}.${propertyName}(${args.map(arg => safeStringify(arg)).join(', ')})`,
                    category: 'dbmethod',
                    data: { args: JSON.stringify(args) },
                  })
                }
                resolve('timeout')
              }, 1)
            })
            // Create a promise that resolves when the original method completes
            const completionPromise = result.then(
              (value: any) => ({ type: 'success', value }),
              (error: any) => ({ type: 'error', error }),
            )

            // Race between completion and delayed start log
            return Promise.race([completionPromise, startLog])
              .then(raceResult => {
                if (raceResult === 'timeout') {
                  // Timeout won the race, now wait for actual completion
                  return completionPromise
                } else {
                  // Method completed before timeout
                  startLogged = true // Prevent delayed log from firing
                  return raceResult
                }
              })
              .then(completionResult => {
                const duration = performance.now() - start

                // Only log completion if duration >= 1ms
                if (duration >= 1) {
                  if (completionResult.type === 'success') {
                    logger.log({
                      message: `Completed in ${duration.toFixed(0)}ms: ${className}.${propertyName}`,
                      category: 'dbmethod',
                    })
                    return completionResult.value
                  } else {
                    logger.log({
                      message: `Failed after ${duration.toFixed(0)}ms: ${className}.${propertyName}`,
                      category: 'dbmethod',
                      type: 'error',
                      data: {
                        error: completionResult.error,
                      },
                    })
                    throw completionResult.error
                  }
                } else {
                  // Duration < 1ms, return result without logging
                  if (completionResult.type === 'success') {
                    return completionResult.value
                  } else {
                    throw completionResult.error
                  }
                }
              })
          }
        }

        return result
      }

      Object.defineProperty(target.prototype, propertyName, descriptor)
    }
  })
}
