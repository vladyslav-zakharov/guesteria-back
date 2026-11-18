import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    liteBookingResponseSchema,
    liteHotelDetailsResponseSchema,
    liteHotelsResponseSchema,
    litePlacesResponseSchema,
    litePrebookResponseSchema,
    liteRatesResponseSchema,
} from "@/lib/validation/liteapi/liteapi.schema.js";

const fixture = (name: string): unknown =>
    JSON.parse(
        fs.readFileSync(
            path.join(process.cwd(), "test/fixtures/liteapi", `${name}.json`),
            "utf-8"
        )
    );

describe("LiteAPI response schemas parse the recorded sandbox fixtures", () => {
    it.each([
        ["places-barcelona", litePlacesResponseSchema],
        ["places-lviv", litePlacesResponseSchema],
        ["data-hotels-barcelona", liteHotelsResponseSchema],
        ["rates-barcelona", liteRatesResponseSchema],
        ["rates-single-hotel", liteRatesResponseSchema],
        ["data-hotel", liteHotelDetailsResponseSchema],
        ["prebook", litePrebookResponseSchema],
        ["book", liteBookingResponseSchema],
        ["booking-get", liteBookingResponseSchema],
    ])("%s", (name, schema) => {
        expect(schema.safeParse(fixture(name)).success).toBe(true);
    });

    it("fails loudly when a required field disappears", () => {
        const rates = fixture("rates-barcelona") as {
            data: { roomTypes: { offerId?: string }[] }[];
        };

        delete rates.data[0].roomTypes[0].offerId;

        expect(liteRatesResponseSchema.safeParse(rates).success).toBe(false);
    });
});
