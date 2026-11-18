import { describe, expect, it } from "vitest";
import {
    countNights,
    fromStayDate,
    getTodayStayDate,
    getUtcDayStart,
    toStayDate,
} from "@/lib/dates/dates.js";

describe("stay date helpers", () => {
    it("round-trips a stay date through UTC midnight", () => {
        expect(fromStayDate("2026-12-18").toISOString()).toBe(
            "2026-12-18T00:00:00.000Z"
        );
        expect(toStayDate(fromStayDate("2026-12-18"))).toBe("2026-12-18");
    });

    it("counts nights across a month and a DST boundary", () => {
        expect(
            countNights({ checkin: "2026-12-18", checkout: "2026-12-20" })
        ).toBe(2);
        expect(
            countNights({ checkin: "2027-03-27", checkout: "2027-04-02" })
        ).toBe(6);
    });

    it("returns the start of the UTC day", () => {
        expect(
            getUtcDayStart(new Date("2026-11-18T23:59:59.999Z")).toISOString()
        ).toBe("2026-11-18T00:00:00.000Z");
    });

    it("rejects impossible or malformed stay dates", () => {
        expect(Number.isNaN(fromStayDate("2026-02-30").getTime())).toBe(true);
        expect(Number.isNaN(fromStayDate("18/11/2026").getTime())).toBe(true);
        expect(
            countNights({ checkin: "2026-12-18", checkout: "2026-13-01" })
        ).toBeNaN();
    });

    it("formats the UTC calendar day, not the local one", () => {
        expect(toStayDate(new Date("2026-11-18T23:30:00.000Z"))).toBe(
            "2026-11-18"
        );
        expect(getTodayStayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
