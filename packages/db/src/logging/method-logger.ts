export function logDbMethods(target: Function) {
  const propertyNames = Object.getOwnPropertyNames(target.prototype);
  propertyNames.forEach(propertyName => {
    if (propertyName === 'constructor') return;
    
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyName);
    if (descriptor && typeof descriptor.value === 'function') {
      const method = descriptor.value;
      
      descriptor.value = function (...args: unknown[]) {
        const result = method.apply(this, args);
        
        // Check if the result is a Promise
        if (result && typeof result.then === 'function') {
          const logger = (this as any).db?.logger;
          const className = target.name;
          
          if (logger) {
            const start = performance.now();
            let startLogged = false;
            
            // Create a delayed start log promise
            const delayedStartLog = new Promise<'timeout'>(resolve => {
              setTimeout(() => {
                if (!startLogged) {
                  startLogged = true;
                  logger.debug(`[${className}.${propertyName}(${args.map(arg => JSON.stringify(arg)).join(', ')})] Starting execution`);
                }
                resolve('timeout');
              }, 1);
            });
            
            // Create a promise that resolves when the original method completes
            const completionPromise = result.then(
              (value: any) => ({ type: 'success', value }),
              (error: any) => ({ type: 'error', error })
            );
            
            // Race between completion and delayed start log
            return Promise.race([completionPromise, delayedStartLog])
              .then((raceResult) => {
                if (raceResult === 'timeout') {
                  // Timeout won the race, now wait for actual completion
                  return completionPromise;
                } else {
                  // Method completed before timeout
                  startLogged = true; // Prevent delayed log from firing
                  return raceResult;
                }
              })
              .then((completionResult: any) => {
                const duration = performance.now() - start;
                
                // Only log completion if duration >= 1ms
                if (duration >= 1) {
                  if (completionResult.type === 'success') {
                    logger.debug(`[${className}.${propertyName}] Completed in ${duration.toFixed(0)}ms`);
                    return completionResult.value;
                  } else {
                    logger.error(`[${className}.${propertyName}] Failed after ${duration.toFixed(0)}ms:`, completionResult.error);
                    throw completionResult.error;
                  }
                } else {
                  // Duration < 1ms, return result without logging
                  if (completionResult.type === 'success') {
                    return completionResult.value;
                  } else {
                    throw completionResult.error;
                  }
                }
              });
          }
        }
        
        return result;
      };
      
      Object.defineProperty(target.prototype, propertyName, descriptor);
    }
  });
}