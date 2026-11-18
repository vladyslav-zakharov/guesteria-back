import { describe, expect, it } from "vitest";
import { buildStayQuerySchema } from "@/lib/validation/stay/stay.schema.js";

const schema = buildStayQuerySchema({ today: () => "2026-11-18" });

const valid = {
    checkin: "2026-12-10",
    checkout: "2026-12-12",
    adults: "2",
    children: "5,7",
};

describe("stayQuerySchema", () => {
    it("parses a valid stay from query strings", () => {
        expect(schema.parse(valid)).toEqual({
            checkin: "2026-12-10",
            checkout: "2026-12-12",
            adults: 2,
            children: [5, 7],
        });
    });

    it.each([
        ["checkout before checkin", { checkout: "2026-12-09" }],
        ["checkout equal to checkin", { checkout: "2026-12-10" }],
        ["31 nights", { checkout: "2027-01-10" }],
        [
            "checkin in the past",
            { checkin: "2026-11-17", checkout: "2026-11-19" },
        ],
        [
            "checkin beyond 365 days",
            { checkin: "2027-11-19", checkout: "2027-11-20" },
        ],
        ["0 adults", { adults: "0" }],
        ["9 adults", { adults: "9" }],
        ["non-integer adults", { adults: "2.5" }],
        ["empty adults", { adults: "" }],
        ["child aged 18", { children: "18" }],
        ["5 children", { children: "1,2,3,4,5" }],
        ["malformed children", { children: "5,,7" }],
        ["malformed date", { checkin: "10/12/2026" }],
        ["impossible date", { checkout: "2026-12-32" }],
    ])("rejects %s", (_label, patch) => {
        expect(schema.safeParse({ ...valid, ...patch }).success).toBe(false);
    });

    it("parses children='' and a missing children param to []", () => {
        expect(schema.parse({ ...valid, children: "" }).children).toEqual([]);
        expect(
            schema.parse({
                checkin: valid.checkin,
                checkout: valid.checkout,
                adults: valid.adults,
            }).children
        ).toEqual([]);
    });

    it("accepts checkin today, 30 nights and checkin at +365 days", () => {
        expect(
            schema.safeParse({
                ...valid,
                checkin: "2026-11-18",
                checkout: "2026-12-18",
            }).success
        ).toBe(true);
        expect(
            schema.safeParse({
                ...valid,
                checkin: "2027-11-18",
                checkout: "2027-11-19",
            }).success
        ).toBe(true);
    });

    it("reads today on every parse", () => {
        let today = "2026-11-18";
        const moving = buildStayQuerySchema({ today: () => today });

        expect(moving.safeParse(valid).success).toBe(true);
        today = "2026-12-11";
        expect(moving.safeParse(valid).success).toBe(false);
    });
});
