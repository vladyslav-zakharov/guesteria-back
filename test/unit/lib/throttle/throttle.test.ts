import { createThrottle } from "@/lib/throttle/throttle.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settled = async <T>(promise: Promise<T>) => {
    const state: { done: boolean; value?: T } = { done: false };

    void promise.then((value) => {
        state.done = true;
        state.value = value;
    });

    await vi.advanceTimersByTimeAsync(0);

    return state;
};

describe("createThrottle", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("lets the first `limit` calls of a window through at once", async () => {
        const throttle = createThrottle({
            limit: 3,
            windowMs: 1000,
            maxWaitMs: 2000,
        });

        const results = await Promise.all([
            throttle.acquire(),
            throttle.acquire(),
            throttle.acquire(),
        ]);

        expect(results).toEqual([true, true, true]);
    });

    it("makes the next call wait until the window frees a slot", async () => {
        const throttle = createThrottle({
            limit: 3,
            windowMs: 1000,
            maxWaitMs: 2000,
        });

        await Promise.all([
            throttle.acquire(),
            throttle.acquire(),
            throttle.acquire(),
        ]);

        const fourth = await settled(throttle.acquire());

        expect(fourth.done).toBe(false);

        await vi.advanceTimersByTimeAsync(999);
        expect(fourth.done).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(fourth).toEqual({ done: true, value: true });
    });

    it("gives up with false when a slot is not free within maxWaitMs", async () => {
        const throttle = createThrottle({
            limit: 3,
            windowMs: 1000,
            maxWaitMs: 2000,
        });

        const calls = Array.from({ length: 12 }, () => throttle.acquire());

        await vi.advanceTimersByTimeAsync(5000);

        const results = await Promise.all(calls);

        expect(results.filter(Boolean)).toHaveLength(9);
        expect(results.slice(9)).toEqual([false, false, false]);
    });

    it("never lets more than `limit` calls start in any window", async () => {
        const throttle = createThrottle({
            limit: 3,
            windowMs: 1000,
            maxWaitMs: 2000,
        });
        const starts: number[] = [];

        const calls = Array.from({ length: 9 }, () =>
            throttle.acquire().then((ok) => {
                if (ok) {
                    starts.push(Date.now());
                }

                return ok;
            })
        );

        await vi.advanceTimersByTimeAsync(5000);
        await Promise.all(calls);

        starts.forEach((start) => {
            expect(
                starts.filter((other) => other >= start && other < start + 1000)
                    .length
            ).toBeLessThanOrEqual(3);
        });
    });
});
