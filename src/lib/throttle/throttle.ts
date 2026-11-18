import { Throttle, ThrottleOptions } from "./throttle.type.js";

const sleep = (ms: number): Promise<number> =>
    new Promise((resolve) => {
        setTimeout(() => resolve(ms), ms);
    });

/**
 * In-process sliding-window limiter: at most `limit` acquisitions start in any
 * `windowMs`. A caller over the budget waits for the next free slot; if that
 * slot is later than `maxWaitMs` from its first attempt, `acquire` resolves
 * `false` and the caller must fail fast. The check and the claim run in one
 * synchronous step, so concurrent callers cannot take the same slot.
 */
export const createThrottle = ({
    limit,
    windowMs,
    maxWaitMs,
}: ThrottleOptions): Throttle => {
    const starts: number[] = [];

    const acquire = async (): Promise<boolean> => {
        const deadline = Date.now() + maxWaitMs;

        for (;;) {
            const now = Date.now();

            while (starts.length > 0 && starts[0] <= now - windowMs) {
                starts.shift();
            }

            if (starts.length < limit) {
                starts.push(now);

                return true;
            }

            const freeAt = starts[0] + windowMs;

            if (freeAt > deadline) {
                return false;
            }

            await sleep(freeAt - now);
        }
    };

    return { acquire };
};
