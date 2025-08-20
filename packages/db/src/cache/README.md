# TypedCache System

The TypedCache system provides a clean, type-safe way to handle database caching while avoiding the Cloudflare Workers issue where objects stored in cache contained references to `DbClient` instances from previous requests.

## Problem Solved

**Before**: The cache stored full objects (`this`) which contained `DbClient` references, causing:

```
connection terminated. Cannot perform I/O on behalf of a different request.
I/O objects (such as streams, request/response bodies, and others) created
in the context of one request handler cannot be accessed from a different
request's handler.
```

**After**: The cache stores only pure data (`this.data`) and automatically reconstructs objects when retrieved.

## Architecture

```
DbCache (main cache class)
├── TypedCache<K, V, K2> (typed wrapper)
│   ├── CacheMap<K, V, K2> (underlying storage)
│   └── Object Constructor (for reconstruction)
└── Cache Statistics & Management
```

## Key Features

### 1. **Automatic Data Extraction**

```typescript
// Stores only entity.data, not the full entity
cache.set('id', entity) // entity.data is stored automatically
```

### 2. **Automatic Object Reconstruction**

```typescript
// Returns new Entity(data, currentDbClient)
const entity = cache.get('id')
```

### 3. **Type Safety**

```typescript
const usersCache: TypedCache<string, UserSelect> = // ...
const user = usersCache.get('123') // TypeScript knows this is User | undefined
```

### 4. **Clean API**

```typescript
// Simple operations
cache.set(key, value)
cache.get(key)
cache.has(key)
cache.delete(key)
cache.clear()
```

## Usage

### Basic Usage

```typescript
import { TypedCache } from './cache'

// Create a typed cache
const userCache = new TypedCache(
  new CacheMap<string, UserSelect>('users'),
  User, // Constructor function
  dbClient,
  'users',
)

// Store a user (only data is stored)
userCache.set('123', userEntity)

// Retrieve a user (automatically reconstructed)
const user = userCache.get('123') // Returns new User(data, dbClient)
```

### In Entity Classes

```typescript
export class User extends PartialUser {
  constructor(
    public data: UserSelect,
    public db: DbClient,
  ) {
    super({ id: data.id }, db)
    // TypedCache automatically stores this.data, not this
    db.cache.users.set(data.id, this)
  }
}
```

### In Manager Classes

```typescript
export class UsersManager extends DbObjectManager {
  async fetch(id: string): Promise<User | undefined> {
    // TypedCache automatically reconstructs objects
    if (this.db.cache.users.has(id)) {
      return this.db.cache.users.get(id)!
    }

    // ... database query logic
  }
}
```

## Migration from Old System

### Before (Old System)

```typescript
// Cache stored full objects
db.cache.guilds.set(data.id, this)

// Manual reconstruction needed
if (this.db.cache.guilds.has(id)) {
  const cached = this.db.cache.guilds.get(id)!
  return new Guild(cached.data, this.db)
}
```

### After (New System)

```typescript
// Cache automatically stores only data
db.cache.guilds.set(data.id, this)

// Automatic reconstruction
if (this.db.cache.guilds.has(id)) {
  return this.db.cache.guilds.get(id)!
}
```

## Benefits

1. **No More Cloudflare Workers Errors**: Only pure data is stored
2. **Cleaner Code**: No manual object reconstruction
3. **Type Safety**: Full TypeScript support
4. **Performance**: Automatic optimization
5. **Maintainability**: Centralized cache logic
6. **Consistency**: Same pattern across all entities

## Cache Statistics

```typescript
const stats = cache.getStats()
// Returns: [{ name: 'users', size: 5 }, { name: 'guilds', size: 3 }]
```

## Advanced Features

### Secondary Keys

```typescript
// For caches with secondary keys (like players_by_ranking_user)
cache.set(rankingId, player, userId)
const player = cache.get(rankingId, userId)
```

### Cache Warming

```typescript
// Pre-populate frequently accessed data
const frequentlyAccessedUsers = ['123', '456', '789']
frequentlyAccessedUsers.forEach(id => {
  if (!cache.has(id)) {
    // Fetch and cache
  }
})
```

## Implementation Notes

- The system maintains backward compatibility
- All existing cache operations continue to work
- New features are opt-in
- Performance impact is minimal
- Memory usage is reduced (no DbClient references)

## Future Enhancements

- TTL (Time To Live) support
- Cache invalidation strategies
- Performance monitoring
- Cache warming utilities
- Distributed cache support
