import { StoredEntry, TtlCache, TtlCacheOptions } from "./ttl-cache.type.js";

/**
 * In-memory LRU cache with a fixed TTL per entry. A Map keeps insertion order,
 * so re-inserting on read moves a key to the most-recent end and the first key
 * is always the least recently used one.
 */
export const createTtlCache = <T>({
    max,
    ttlMs,
    now = Date.now,
}: TtlCacheOptions): TtlCache<T> => {
    const store = new Map<string, StoredEntry<T>>();

    return {
        get: (key) => {
            const entry = store.get(key);

            if (!entry) {
                return undefined;
            }

            store.delete(key);

            if (entry.expiresAt <= now()) {
                return undefined;
            }

            store.set(key, entry);

            return entry.value;
        },

        set: ({ key, value }) => {
            store.delete(key);
            store.set(key, { value, expiresAt: now() + ttlMs });

            while (store.size > max) {
                const oldestKey = store.keys().next().value;

                if (oldestKey === undefined) {
                    break;
                }

                store.delete(oldestKey);
            }

            return value;
        },
    };
};
