import { describe, expect, it } from "vitest";
import { mapLiteApiError } from "@/lib/liteapi/liteapi.error.js";

describe("mapLiteApiError", () => {
    it.each([
        [{ httpStatus: 200, code: 2001 }, 409],
        [{ httpStatus: 400, code: 4016 }, 504],
        [{ httpStatus: 400, code: 4040 }, 409],
        [{ httpStatus: 404, code: 4004 }, 404],
        [{ httpStatus: 429, code: null }, 503],
        [{ httpStatus: 500, code: 9999 }, 502],
        [{ httpStatus: 401, code: null }, 502],
    ])("maps %o to %i", (input, statusCode) => {
        expect(mapLiteApiError(input)).toMatchObject({ statusCode });
    });

    it("never carries the upstream message", () => {
        const error = mapLiteApiError({ httpStatus: 500, code: 1234 });

        expect(error.message).not.toMatch(/liteapi|nuitee|upstream raw/i);
    });
});
