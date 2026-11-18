import { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { configureServer } from "@/server.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import {
    MockInstance,
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    DEFAULT_PASSWORD,
    SignedUpUser,
    authCookies,
    signUp,
} from "@test/int/helpers/auth.js";
import {
    SeededStay,
    createSeedClient,
    seedPrebook,
    seedStay,
} from "@test/int/helpers/seed.js";

const guest = {
    firstName: "Intruder",
    lastName: "Guest",
    email: "b@example.com",
    phone: "+380501234567",
};

const notFoundBody = (message: string) => ({
    statusCode: 404,
    code: "404",
    error: "Not Found",
    message,
});

/**
 * No request in this file may reach LiteAPI or Vertex: every ownership check
 * must 404 before them. `fetch` (the transport of both the LiteAPI client and
 * the Vertex SDK) is replaced by a spy that fails, and each test asserts it
 * was never called. The chat POST runs under explicit AI configurations
 * (enabled, `AI_DAILY_LIMIT=0`, no `GCP_PROJECT_ID`) via `vi.stubEnv`, so the
 * result does not depend on what a developer's local `.env` leaks into
 * `process.env` (Prisma Client loads it).
 */
describe("ownership and isolation (AC 8)", () => {
    let server: FastifyInstance;
    let prisma: PrismaClient;
    let userA: SignedUpUser;
    let userB: SignedUpUser;
    let stayA: SeededStay;
    let fetchSpy: MockInstance<typeof fetch>;

    beforeEach(async () => {
        fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockRejectedValue(new Error("Upstream call in an ownership test"));

        server = await configureServer();
        prisma = createSeedClient();

        userA = await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });
        userB = await signUp(server, {
            email: "b@example.com",
            password: DEFAULT_PASSWORD,
        });
        stayA = await seedStay(prisma, { userId: userA.id });

        return async () => {
            await prisma.$disconnect();
            await server.close();
        };
    });

    afterEach(() => {
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    describe("owner control", () => {
        it("user A reads their own booking", async () => {
            const response = await server.inject({
                method: "GET",
                url: `/api/bookings/${stayA.booking.id}`,
                cookies: authCookies(userA.cookie),
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({
                booking: { id: stayA.booking.id, status: "CONFIRMED" },
            });
        });

        it("user A reads their own chat", async () => {
            const response = await server.inject({
                method: "GET",
                url: `/api/bookings/${stayA.booking.id}/messages`,
                cookies: authCookies(userA.cookie),
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({
                messages: [
                    { id: stayA.messages[0].id, role: "user" },
                    { id: stayA.messages[1].id, role: "assistant" },
                ],
                remainingToday: 30,
            });
        });

        it("GET /api/bookings as A returns only A's booking", async () => {
            await seedStay(prisma, { userId: userB.id });

            const response = await server.inject({
                method: "GET",
                url: "/api/bookings",
                cookies: authCookies(userA.cookie),
            });
            const { bookings } = response.json<{
                bookings: { id: string }[];
            }>();

            expect(response.statusCode).toBe(200);
            expect(bookings.map(({ id }) => id)).toEqual([stayA.booking.id]);
        });

        it("GET /api/bookings returns the newest checkin first", async () => {
            const laterStay = await seedStay(prisma, { userId: userA.id });
            const laterCheckin = new Date(stayA.booking.checkin);
            laterCheckin.setUTCDate(laterCheckin.getUTCDate() + 7);
            await prisma.booking.update({
                where: { id: laterStay.booking.id },
                data: { checkin: laterCheckin },
            });

            const response = await server.inject({
                method: "GET",
                url: "/api/bookings",
                cookies: authCookies(userA.cookie),
            });
            const { bookings } = response.json<{
                bookings: { id: string }[];
            }>();

            expect(response.statusCode).toBe(200);
            expect(bookings.map(({ id }) => id)).toEqual([
                laterStay.booking.id,
                stayA.booking.id,
            ]);
        });
    });

    describe("user B on user A's resources", () => {
        it("GET /api/bookings/:bookingId returns 404", async () => {
            const response = await server.inject({
                method: "GET",
                url: `/api/bookings/${stayA.booking.id}`,
                cookies: authCookies(userB.cookie),
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual(
                notFoundBody(RESPONSE_MESSAGES.booking.notFound)
            );
        });

        it("GET /api/bookings/:bookingId/messages returns 404", async () => {
            const response = await server.inject({
                method: "GET",
                url: `/api/bookings/${stayA.booking.id}/messages`,
                cookies: authCookies(userB.cookie),
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual(
                notFoundBody(RESPONSE_MESSAGES.booking.notFound)
            );
        });

        it.each([
            {
                label: "the AI enabled",
                env: {
                    GCP_PROJECT_ID: "not-a-real-project",
                    AI_DAILY_LIMIT: "30",
                },
            },
            {
                label: "AI_DAILY_LIMIT=0",
                env: {
                    GCP_PROJECT_ID: "not-a-real-project",
                    AI_DAILY_LIMIT: "0",
                },
            },
            {
                label: "no GCP_PROJECT_ID",
                env: { GCP_PROJECT_ID: "", AI_DAILY_LIMIT: "30" },
            },
        ])(
            "POST /api/bookings/:bookingId/messages with $label returns 404 and stores and counts nothing",
            async ({ env }) => {
                Object.entries(env).forEach(([name, value]) => {
                    vi.stubEnv(name, value);
                });

                const chatServer = await configureServer();

                const response = await chatServer
                    .inject({
                        method: "POST",
                        url: `/api/bookings/${stayA.booking.id}/messages`,
                        cookies: authCookies(userB.cookie),
                        body: { content: "hi" },
                    })
                    .finally(async () => {
                        await chatServer.close();
                        vi.unstubAllEnvs();
                    });

                expect(response.statusCode).toBe(404);
                expect(response.json()).toEqual(
                    notFoundBody(RESPONSE_MESSAGES.booking.notFound)
                );
                expect(
                    await prisma.chatMessage.count({
                        where: { bookingId: stayA.booking.id },
                    })
                ).toBe(stayA.messages.length);
                expect(await prisma.aiUsage.count()).toBe(0);
            }
        );

        it("POST /api/bookings with A's prebook returns 404 and leaves the prebook unused", async () => {
            const prebookA = await seedPrebook(prisma, { userId: userA.id });

            const response = await server.inject({
                method: "POST",
                url: "/api/bookings",
                cookies: authCookies(userB.cookie),
                body: { prebookId: prebookA.id, guest },
            });

            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual(
                notFoundBody(RESPONSE_MESSAGES.prebook.notFound)
            );

            const stored = await prisma.prebook.findUniqueOrThrow({
                where: { id: prebookA.id },
            });

            expect(stored.usedAt).toBeNull();
            expect(await prisma.booking.count()).toBe(1);
        });

        it("GET /api/bookings as B returns an empty list", async () => {
            const response = await server.inject({
                method: "GET",
                url: "/api/bookings",
                cookies: authCookies(userB.cookie),
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ bookings: [] });
        });

        it("an unknown booking id gets the same 404 as A's booking", async () => {
            const foreign = await server.inject({
                method: "GET",
                url: `/api/bookings/${stayA.booking.id}`,
                cookies: authCookies(userB.cookie),
            });
            const unknown = await server.inject({
                method: "GET",
                url: "/api/bookings/00000000-0000-4000-8000-000000000000",
                cookies: authCookies(userB.cookie),
            });

            expect(unknown.statusCode).toBe(404);
            expect(unknown.json()).toEqual(foreign.json());
        });
    });

    describe("without a session cookie", () => {
        it.each([
            {
                name: "GET /api/auth/me",
                method: "GET",
                url: () => "/api/auth/me",
            },
            {
                name: "GET /api/bookings",
                method: "GET",
                url: () => "/api/bookings",
            },
            {
                name: "GET /api/bookings/:bookingId",
                method: "GET",
                url: () => `/api/bookings/${stayA.booking.id}`,
            },
            {
                name: "GET /api/bookings/:bookingId/messages",
                method: "GET",
                url: () => `/api/bookings/${stayA.booking.id}/messages`,
            },
            {
                name: "POST /api/bookings/:bookingId/messages",
                method: "POST",
                url: () => `/api/bookings/${stayA.booking.id}/messages`,
                body: () => ({ content: "hi" }),
            },
            {
                name: "POST /api/bookings",
                method: "POST",
                url: () => "/api/bookings",
                body: () => ({ prebookId: stayA.prebook.id, guest }),
            },
            {
                name: "POST /api/bookings/prebook",
                method: "POST",
                url: () => "/api/bookings/prebook",
                body: () => ({
                    hotelId: "lp1897",
                    offerId: "offer-1",
                    checkin: "2030-01-10",
                    checkout: "2030-01-12",
                    adults: 2,
                    children: [],
                }),
            },
        ] satisfies {
            name: string;
            method: "GET" | "POST";
            url: () => string;
            body?: () => object;
        }[])("$name returns 401", async (route) => {
            const response = await server.inject({
                method: route.method,
                url: route.url(),
                body: route.body?.(),
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toMatchObject({
                statusCode: 401,
                message: RESPONSE_MESSAGES.auth.unauthorized,
            });
        });

        it.each([
            { url: "/api/bookings", body: { prebookId: "not-a-uuid" } },
            { url: "/api/bookings/prebook", body: { hotelId: 42 } },
            { url: "/api/bookings/not-a-uuid/messages", body: { content: "" } },
        ])(
            "checks the session before validation on POST $url",
            async ({ url, body }) => {
                const response = await server.inject({
                    method: "POST",
                    url,
                    body,
                });

                expect(response.statusCode).toBe(401);
            }
        );
    });
});
