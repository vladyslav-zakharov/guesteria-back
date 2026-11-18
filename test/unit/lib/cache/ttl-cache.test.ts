import { describe, expect, it } from "vitest";
import { createTtlCache } from "@/lib/cache/ttl-cache.js";

describe("createTtlCache", () => {
    it("returns a set value", () => {
        const cache = createTtlCache<string>({ max: 2, ttlMs: 1000 });

        expect(cache.set({ key: "a", value: "A" })).toBe("A");
        expect(cache.get("a")).toBe("A");
        expect(cache.get("missing")).toBeUndefined();
    });

    it("expires an entry after ttlMs", () => {
        let now = 0;
        const cache = createTtlCache<string>({
            max: 2,
            ttlMs: 1000,
            now: () => now,
        });

        cache.set({ key: "a", value: "A" });
        now = 999;
        expect(cache.get("a")).toBe("A");
        now = 1000;
        expect(cache.get("a")).toBeUndefined();
    });

    it("evicts the least recently used entry beyond max", () => {
        const cache = createTtlCache<string>({ max: 2, ttlMs: 1000 });

        cache.set({ key: "a", value: "A" });
        cache.set({ key: "b", value: "B" });
        cache.get("a");
        cache.set({ key: "c", value: "C" });

        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("a")).toBe("A");
        expect(cache.get("c")).toBe("C");
    });
});
