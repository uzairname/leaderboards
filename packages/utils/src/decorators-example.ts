import { logDbMethod, logExecutionTime, logSyncExecutionTime } from './decorators'

// Example logger interface
interface Logger {
  debug(...args: unknown[]): void
}

// Mock logger for demonstration
class MockLogger implements Logger {
  debug(...args: unknown[]): void {
    console.log('[DEBUG]', ...args)
  }
}

// Example database class using the decorators
class ExampleDatabaseClass {
  private logger = new MockLogger()

  // Using the automatic decorator
  @logDbMethod()
  async fetchUser(id: string) {
    // Simulate database query
    await new Promise(resolve => setTimeout(resolve, 100))
    return { id, name: 'John Doe' }
  }

  // Using the async-specific decorator with custom logger
  @logExecutionTime(this.logger, { prefix: '[User Query]' })
  async createUser(data: { name: string; email: string }) {
    // Simulate database insert
    await new Promise(resolve => setTimeout(resolve, 50))
    return { id: '123', ...data }
  }

  // Using the sync-specific decorator
  @logSyncExecutionTime()
  getUserFromCache(id: string) {
    // Simulate cache lookup
    return { id, name: 'Cached User' }
  }

  // Method without decorator for comparison
  async deleteUser(id: string) {
    await new Promise(resolve => setTimeout(resolve, 30))
    return { success: true }
  }
}

// Example usage
async function demonstrateDecorators() {
  const db = new ExampleDatabaseClass()
  
  console.log('=== Testing Decorated Methods ===')
  
  try {
    const user = await db.fetchUser('123')
    console.log('Fetched user:', user)
    
    const newUser = await db.createUser({ name: 'Jane', email: 'jane@example.com' })
    console.log('Created user:', newUser)
    
    const cachedUser = db.getUserFromCache('456')
    console.log('Cached user:', cachedUser)
    
    const result = await db.deleteUser('789')
    console.log('Delete result:', result)
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// Uncomment to run the example
// demonstrateDecorators()
