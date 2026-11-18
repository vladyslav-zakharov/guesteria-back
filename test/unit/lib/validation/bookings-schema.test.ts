import { describe, expect, it } from "vitest";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { buildPrebookBodySchema } from "@/lib/validation/bookings/bookings.schema.js";

const CHILD_AGES = [5, 7] as const;
const TOO_MANY_CHILDREN = Array.from({ length: 5 }, () => 1);
const ADULT_AGE = 18;

const schema = buildPrebookBodySchema({ today: () => "2026-11-18" });

const valid = {
    hotelId: "lp3b26b",
    offerId: "AwJ2MQAAAABq_reLCPNVjedNoWTxj8Zupj9l",
    checkin: "2026-12-10",
    checkout: "2026-12-12",
    adults: 2,
    children: [...CHILD_AGES],
};

describe("prebookBodySchema", () => {
    it("parses a valid JSON body unchanged", () => {
        expect(schema.parse(valid)).toEqual(valid);
    });

    it("accepts a stay without children", () => {
        expect(schema.safeParse({ ...valid, children: [] }).success).toBe(true);
    });

    it.each([
        ["adults as a string", { adults: "2" }],
        ["children as a comma string", { children: "5,7" }],
        ["child age as a string", { children: ["5"] }],
        ["missing children", { children: undefined }],
        ["0 adults", { adults: 0 }],
        ["9 adults", { adults: 9 }],
        ["non-integer adults", { adults: 2.5 }],
        ["child aged 18", { children: [ADULT_AGE] }],
        ["negative child age", { children: [-1] }],
        ["5 children", { children: TOO_MANY_CHILDREN }],
        ["empty offerId", { offerId: "" }],
        ["hotelId with a space", { hotelId: "lp 1" }],
        ["malformed date", { checkin: "10/12/2026" }],
    ])("rejects %s", (_label, override) => {
        expect(schema.safeParse({ ...valid, ...override }).success).toBe(false);
    });

    it.each([
        [
            "checkout before checkin",
            { checkout: "2026-12-09" },
            RESPONSE_MESSAGES.stay.checkoutBeforeCheckin,
        ],
        [
            "checkout equal to checkin",
            { checkout: "2026-12-10" },
            RESPONSE_MESSAGES.stay.checkoutBeforeCheckin,
        ],
        [
            "31 nights",
            { checkout: "2027-01-10" },
            RESPONSE_MESSAGES.stay.tooManyNights,
        ],
        [
            "checkin in the past (UTC day)",
            { checkin: "2026-11-17", checkout: "2026-11-19" },
            RESPONSE_MESSAGES.stay.checkinInPast,
        ],
        [
            "checkin beyond 365 days",
            { checkin: "2027-11-19", checkout: "2027-11-20" },
            RESPONSE_MESSAGES.stay.checkinTooFar,
        ],
    ])("rejects %s with the shared stay rule", (_label, override, message) => {
        const result = schema.safeParse({ ...valid, ...override });

        expect(result.success).toBe(false);

        expect(result.error?.issues.map((issue) => issue.message)).toContain(
            message
        );
    });

    it("accepts check-in today and exactly 30 nights", () => {
        expect(
            schema.safeParse({
                ...valid,
                checkin: "2026-11-18",
                checkout: "2026-12-18",
            }).success
        ).toBe(true);
    });
});
