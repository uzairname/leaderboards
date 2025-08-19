# Utils Package

This package contains utility functions and decorators for the Leaderboards project.

## Decorators

### Database Method Logging

The package provides decorators for logging method execution times and names, particularly useful for database operations.

#### `@logDbMethod()`

Automatically detects whether a method is async or sync and applies the appropriate logging decorator.

```typescript
import { logDbMethod } from '@repo/utils/decorators'

class MyDatabaseClass {
  @logDbMethod()
  async fetchData(id: string) {
    // Method implementation
    return await db.query(id)
  }

  @logDbMethod()
  getCachedData(id: string) {
    // Synchronous method
    return cache.get(id)
  }
}
```

#### `@logExecutionTime()`

Specifically for async methods. Logs method entry, completion time, and any errors.

```typescript
import { logExecutionTime } from '@repo/utils/decorators'

class MyClass {
  @logExecutionTime()
  async asyncMethod() {
    // Method implementation
  }
}
```

#### `@logSyncExecutionTime()`

For synchronous methods. Logs method entry, completion time, and any errors.

```typescript
import { logSyncExecutionTime } from '@repo/utils/decorators'

class MyClass {
  @logSyncExecutionTime()
  syncMethod() {
    // Method implementation
  }
}
```

### Configuration Options

All decorators accept an optional logger instance and configuration options:

```typescript
@logDbMethod(myLogger, {
  logEntry: true,    // Log when method starts (default: true)
  logExit: true,     // Log when method completes (default: true)
  prefix: '[Custom]' // Custom prefix for log messages (default: '[DB Method]')
})
```

### Logger Requirements

The logger instance must have a `debug` method:

```typescript
interface Logger {
  debug(...args: unknown[]): void
}
```

### Example Output

```
[DB Method] Entering GuildsManager.fetch
[DB Method] GuildsManager.fetch completed in 45.23ms
[DB Method] Entering GuildsManager.create
[DB Method] GuildsManager.create completed in 12.45ms
```

### Error Handling

If a method throws an error, the decorator will log the failure with execution time:

```
[DB Method] GuildsManager.fetch failed after 23.45ms: Error: Database connection failed
```

## Usage in Database Classes

To use these decorators in your database classes:

1. Import the decorator:

   ```typescript
   import { logDbMethod } from '@repo/utils/decorators'
   ```

2. Apply it to methods you want to monitor:

   ```typescript
   @logDbMethod()
   async fetch(id: string) {
     // Method implementation
   }
   ```

3. Optionally pass a logger instance for custom logging:
   ```typescript
   @logDbMethod(this.db.logger)
   async create(data: CreateData) {
     // Method implementation
   }
   ```

## Performance Impact

The decorators add minimal overhead:

- Method entry/exit logging: ~0.1ms
- Performance measurement: ~0.01ms
- Total overhead: typically <0.2ms per method call

This overhead is negligible for database operations that typically take 10ms+.
