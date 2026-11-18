import fs from "node:fs";
import path from "node:path";
import { FastifyBaseLogger } from "fastify";
import { mock } from "vitest-mock-extended";
import { EnvConfig } from "@/types/env.type.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { createLiteApiClient } from "@/lib/liteapi/liteapi.client.js";
import { BookingOutcomeUnknownError } from "@/lib/errors/errors.js";

const API_KEY = "sand_test_key_never_logged";

const config = {
    LITEAPI_API_KEY: API_KEY,
    LITEAPI_DATA_URL: "https://api.example.test/v3.0",
    LITEAPI_BOOK_URL: "https://book.example.test/v3.0",
    LITEAPI_CURRENCY: "EUR",
    LITEAPI_GUEST_NATIONALITY: "UA",
} as EnvConfig;

const fixture = (name: string): { _status: number } =>
    JSON.parse(
        fs.readFileSync(
            path.join(process.cwd(), "test/fixtures/liteapi", `${name}.json`),
            "utf-8"
        )
    );

const respondWith = (name: string) => {
    const body = fixture(name);

    return new Response(JSON.stringify(body), { status: body._status });
};

const rateInput = {
    hotelIds: ["lp1db88"],
    checkin: "2026-12-18",
    checkout: "2026-12-20",
    occupancy: { adults: 2, children: [] },
};

const setup = () => {
    const log = mock<FastifyBaseLogger>();
    const fetchMock = vi.fn<typeof fetch>();

    vi.stubGlobal("fetch", fetchMock);

    return { log, fetchMock, client: createLiteApiClient(config, log) };
};

const loggedText = (log: FastifyBaseLogger) =>
    JSON.stringify([
        vi.mocked(log.warn).mock.calls,
        vi.mocked(log.error).mock.calls,
    ]);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("liteApiClient", () => {
    it("sends the key in the header and the rates body from config", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockResolvedValueOnce(respondWith("rates-single-hotel"));

        const rates = await client.getRates({
            ...rateInput,
            maxRatesPerHotel: 3,
        });
        const [url, init] = fetchMock.mock.calls[0];

        expect(rates).toHaveLength(1);
        expect(String(url)).toBe("https://api.example.test/v3.0/hotels/rates");
        expect(init?.headers).toMatchObject({ "X-API-Key": API_KEY });
        expect(JSON.parse(String(init?.body))).toMatchObject({
            hotelIds: ["lp1db88"],
            occupancies: [{ adults: 2, children: [] }],
            currency: "EUR",
            guestNationality: "UA",
            timeout: 8,
            maxRatesPerHotel: 3,
        });
    });

    it("sends no rates cap when the input has none", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockResolvedValueOnce(respondWith("rates-single-hotel"));

        await client.getRates(rateInput);

        const [, init] = fetchMock.mock.calls[0];

        expect(JSON.parse(String(init?.body))).not.toHaveProperty(
            "maxRatesPerHotel"
        );
    });

    it("returns [] when rates answer 200 with code 2001", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockResolvedValueOnce(respondWith("error-no-availability"));

        await expect(client.getRates(rateInput)).resolves.toEqual([]);
    });

    it("maps 404 + 4004 to NotFoundError without logging the key", async () => {
        const { client, fetchMock, log } = setup();

        fetchMock.mockResolvedValueOnce(respondWith("booking-get-unknown"));

        await expect(client.getHotel("unknown")).rejects.toMatchObject({
            statusCode: 404,
        });
        expect(log.warn).toHaveBeenCalledWith(
            { path: "/v3.0/data/hotel", httpStatus: 404, code: 4004 },
            "LiteAPI error"
        );
        expect(loggedText(log)).not.toContain(API_KEY);
    });

    it("maps the sandbox's 400 + 4002 for an unknown hotel id to 404", async () => {
        const { client, fetchMock, log } = setup();

        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    error: {
                        code: 4002,
                        description: "hotelId is missing or invalid",
                        message:
                            "required request field is missing or wrong input",
                    },
                }),
                { status: 400 }
            )
        );

        const error = await client
            .getHotel("lpzz999999zz")
            .catch((caught: unknown) => caught);

        expect(error).toMatchObject({ statusCode: 404 });
        expect(JSON.stringify(error)).not.toContain("hotelId is missing");
        expect(log.warn).toHaveBeenCalledWith(
            { path: "/v3.0/data/hotel", httpStatus: 400, code: 4002 },
            "LiteAPI unknown hotel"
        );
        expect(loggedText(log)).not.toContain(API_KEY);
    });

    it("keeps 4002 on other endpoints as 502", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ error: { code: 4002, message: "bad input" } }),
                { status: 400 }
            )
        );

        await expect(client.prebook("offer")).rejects.toMatchObject({
            statusCode: 502,
        });
    });

    it("maps a fetch timeout to 504", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockRejectedValueOnce(
            new DOMException("timed out", "TimeoutError")
        );

        await expect(client.prebook("offer")).rejects.toMatchObject({
            statusCode: 504,
        });
    });

    it("maps a network failure to 502", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

        await expect(client.getHotel("lp1db88")).rejects.toMatchObject({
            statusCode: 502,
        });
    });

    it("maps a changed response shape to 502", async () => {
        const { client, fetchMock, log } = setup();

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ data: [{ hotelId: "x" }] }))
        );

        await expect(client.getRates(rateInput)).rejects.toMatchObject({
            statusCode: 502,
        });
        expect(log.error).toHaveBeenCalled();
    });

    it("caches the hotel list by place id", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockResolvedValueOnce(respondWith("data-hotels-barcelona"));

        const first = await client.getHotelsByPlace(
            "ChIJ5TCOcRaYpBIRCmZHTz37sEQ"
        );
        const second = await client.getHotelsByPlace(
            "ChIJ5TCOcRaYpBIRCmZHTz37sEQ"
        );

        expect(second).toBe(first);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url] = fetchMock.mock.calls[0];

        expect(new URL(String(url)).searchParams.get("limit")).toBe("50");
    });

    it("caches places by lower-cased query and hotel details by id", async () => {
        const { client, fetchMock } = setup();

        fetchMock
            .mockResolvedValueOnce(respondWith("places-barcelona"))
            .mockResolvedValueOnce(respondWith("data-hotel"));

        const first = await client.searchPlaces("Barcelona");
        const second = await client.searchPlaces("  barcelona ");

        await client.getHotel("lp1db88");
        await client.getHotel("lp1db88");

        expect(second).toBe(first);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    describe("search throttle", () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("spends 3 search calls per second and lets prebook bypass the budget", async () => {
            const { client, fetchMock } = setup();

            fetchMock.mockImplementation(async (url) =>
                String(url).includes("/rates/prebook")
                    ? respondWith("prebook")
                    : respondWith("places-barcelona")
            );

            const searches = ["a1", "b2", "c3", "d4"].map((query) =>
                client.searchPlaces(query)
            );

            await vi.advanceTimersByTimeAsync(0);
            expect(fetchMock).toHaveBeenCalledTimes(3);

            await client.prebook("offer-1");
            expect(fetchMock).toHaveBeenCalledTimes(4);

            await vi.advanceTimersByTimeAsync(1000);
            await Promise.all(searches);
            expect(fetchMock).toHaveBeenCalledTimes(5);
        });

        it("answers 503 searchBusy when no search slot frees up within 2 s", async () => {
            const { client, fetchMock, log } = setup();

            fetchMock.mockImplementation(async () =>
                respondWith("places-barcelona")
            );

            const searches = Array.from({ length: 10 }, (_unused, index) =>
                client.searchPlaces(`q${index}`).then(
                    () => null,
                    (error: unknown) => error
                )
            );

            await vi.advanceTimersByTimeAsync(5000);

            const errors = (await Promise.all(searches)).filter(Boolean);

            expect(fetchMock).toHaveBeenCalledTimes(9);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({
                statusCode: 503,
                message: RESPONSE_MESSAGES.liteapi.searchBusy,
            });
            expect(log.warn).toHaveBeenCalledWith(
                expect.objectContaining({ path: "/v3.0/data/places" }),
                expect.any(String)
            );
        });
    });

    describe("book outcome", () => {
        const bookInput = {
            prebookId: "EBuls8BUG",
            clientReference: "8efd576a-1535-4a76-8460-fabe8f1ab8cc",
            guest: {
                firstName: "Test",
                lastName: "Guest",
                email: "guest@example.com",
                phone: "+380000000000",
            },
        };

        const respondJson = (status: number, body: unknown) =>
            new Response(JSON.stringify(body), { status });

        it("accepts a 200 that carries only bookingId and status", async () => {
            const { client, fetchMock } = setup();

            fetchMock.mockResolvedValueOnce(
                respondJson(200, {
                    data: { bookingId: "LB-1", status: "CONFIRMED" },
                })
            );

            await expect(client.book(bookInput)).resolves.toMatchObject({
                bookingId: "LB-1",
                status: "CONFIRMED",
            });
        });

        it("treats a 200 with an unreadable body as an unknown outcome and logs the reference", async () => {
            const { client, fetchMock, log } = setup();

            fetchMock.mockResolvedValueOnce(
                new Response("{not json", { status: 200 })
            );

            const error = await client
                .book(bookInput)
                .catch((reason) => reason);

            expect(error).toBeInstanceOf(BookingOutcomeUnknownError);
            expect(error).toMatchObject({ statusCode: 502 });
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    clientReference: bookInput.clientReference,
                    liteBookingId: null,
                }),
                expect.any(String)
            );
            expect(loggedText(log)).not.toContain(API_KEY);
            expect(loggedText(log)).not.toContain(bookInput.guest.email);
        });

        it("logs the LiteAPI booking id when a 200 has an id but an unreadable shape", async () => {
            const { client, fetchMock, log } = setup();

            fetchMock.mockResolvedValueOnce(
                respondJson(200, { data: { bookingId: "LB-2" } })
            );

            await expect(client.book(bookInput)).rejects.toBeInstanceOf(
                BookingOutcomeUnknownError
            );
            expect(log.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    clientReference: bookInput.clientReference,
                    liteBookingId: "LB-2",
                }),
                expect.any(String)
            );
        });

        it.each([
            ["a 4xx", 400, { error: { code: 4000, message: "bad" } }],
            [
                "a 200 with an error envelope",
                200,
                { error: { code: 2001, message: "x" } },
            ],
        ])(
            "maps %s to a definite failure, not an unknown outcome",
            async (_label, status, body) => {
                const { client, fetchMock } = setup();

                fetchMock.mockResolvedValueOnce(respondJson(status, body));

                const error = await client
                    .book(bookInput)
                    .catch((reason) => reason);

                expect(error).not.toBeInstanceOf(BookingOutcomeUnknownError);
                expect(error).toHaveProperty("statusCode");
            }
        );
    });

    it("posts the booking body to the book host", async () => {
        const { client, fetchMock } = setup();

        fetchMock.mockResolvedValueOnce(respondWith("book"));

        const booking = await client.book({
            prebookId: "EBuls8BUG",
            clientReference: "8efd576a-1535-4a76-8460-fabe8f1ab8cc",
            guest: {
                firstName: "Test",
                lastName: "Guest",
                email: "guest@example.com",
                phone: "+380000000000",
            },
        });
        const [url, init] = fetchMock.mock.calls[0];

        expect(booking.status).toBe("CONFIRMED");
        expect(String(url)).toBe("https://book.example.test/v3.0/rates/book");
        expect(JSON.parse(String(init?.body))).toMatchObject({
            prebookId: "EBuls8BUG",
            holder: { firstName: "Test", phone: "+380000000000" },
            guests: [{ occupancyNumber: 1, firstName: "Test" }],
            payment: { method: "ACC_CREDIT_CARD" },
        });
    });
});
