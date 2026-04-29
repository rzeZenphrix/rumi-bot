package rocks.rumi.music.cache;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class CacheService {
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public String get(String key) {
        CacheEntry entry = cache.get(key);
        if (entry == null) return null;
        if (entry.expiresAt() != null && entry.expiresAt().isBefore(Instant.now())) {
            cache.remove(key);
            return null;
        }
        return entry.value();
    }

    public void put(String key, String value, long ttlSeconds) {
        Instant expiresAt = ttlSeconds > 0 ? Instant.now().plusSeconds(ttlSeconds) : null;
        cache.put(key, new CacheEntry(value, expiresAt));
    }

    public int size() {
        return cache.size();
    }

    private record CacheEntry(String value, Instant expiresAt) {
    }
}
