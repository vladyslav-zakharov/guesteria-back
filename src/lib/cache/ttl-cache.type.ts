export type TtlCacheEntry<T> = { key: string; value: T };

export type TtlCache<T> = {
    get: (key: string) => T | undefined;
    set: (entry: TtlCacheEntry<T>) => T;
};

export type TtlCacheOptions = {
    max: number;
    ttlMs: number;
    now?: () => number;
};

export type StoredEntry<T> = { value: T; expiresAt: number };
