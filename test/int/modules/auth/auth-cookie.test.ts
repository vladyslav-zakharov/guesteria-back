import { FastifyInstance } from "fastify";
import { configureServer } from "@/server.js";
import { beforeEach, describe, expect, it } from "vitest";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import {
    AUTH_RATE_LIMIT_MAX,
    SIGN_IN_EMAIL_RATE_LIMIT_MAX,
} from "@/modules/auth/auth.constant.js";
import {
    DEFAULT_PASSWORD,
    authCookies,
    findAuthCookie,
    signUp,
} from "@test/int/helpers/auth.js";

const signIn = (
    server: FastifyInstance,
    body: { email: string; password: string }
) => server.inject({ method: "POST", url: "/api/auth/sign-in", body });

describe("auth cookie (AC 9)", () => {
    let server: FastifyInstance;

    beforeEach(async () => {
        server = await configureServer();

        return async () => {
            await server.close();
        };
    });

    it("sign-up returns 201 with the user DTO and sets the session cookie", async () => {
        const { response } = await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
            user: {
                id: expect.any(String),
                email: "a@example.com",
                firstName: "Test",
                lastName: "Guest",
            },
        });
        expect(findAuthCookie(response)).toMatchObject({
            httpOnly: true,
            sameSite: "Lax",
            path: "/",
        });
    });

    it("sign-in sets an HttpOnly SameSite=Lax access_token cookie with no Domain", async () => {
        await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        const response = await signIn(server, {
            email: "A@Example.com",
            password: DEFAULT_PASSWORD,
        });
        const cookie = findAuthCookie(response);

        expect(response.statusCode).toBe(200);
        expect(cookie).toMatchObject({
            httpOnly: true,
            sameSite: "Lax",
            path: "/",
        });
        expect(cookie?.value).not.toBe("");
        expect(cookie?.domain).toBeUndefined();
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("the sign-in cookie authenticates GET /api/auth/me", async () => {
        const { id } = await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });
        const signInResponse = await signIn(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });
        const cookie = findAuthCookie(signInResponse);

        const response = await server.inject({
            method: "GET",
            url: "/api/auth/me",
            cookies: authCookies(cookie?.value ?? ""),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            user: { id, email: "a@example.com" },
        });
        expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("wrong password and unknown email return the identical 401 body", async () => {
        await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        const wrong = await signIn(server, {
            email: "a@example.com",
            password: "nope-nope",
        });
        const unknown = await signIn(server, {
            email: "b@example.com",
            password: "nope-nope",
        });

        expect(wrong.statusCode).toBe(401);
        expect(unknown.statusCode).toBe(401);
        expect(wrong.json()).toMatchObject({
            statusCode: 401,
            message: RESPONSE_MESSAGES.auth.invalidCredentials,
        });
        expect(unknown.json()).toEqual(wrong.json());
        expect(findAuthCookie(wrong)).toBeUndefined();
        expect(findAuthCookie(unknown)).toBeUndefined();
    });

    it("rejects a duplicate email, case-insensitively, with 409", async () => {
        await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        const response = await server.inject({
            method: "POST",
            url: "/api/auth/sign-up",
            body: {
                email: "A@EXAMPLE.com",
                password: DEFAULT_PASSWORD,
                firstName: "Other",
                lastName: "Person",
            },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
            statusCode: 409,
            message: RESPONSE_MESSAGES.auth.emailTaken,
        });
        expect(findAuthCookie(response)).toBeUndefined();
    });

    it.each([
        { label: "7 characters", password: "a".repeat(7) },
        { label: "73 characters", password: "a".repeat(73) },
    ])("rejects a password of $label with 400", async ({ password }) => {
        const response = await server.inject({
            method: "POST",
            url: "/api/auth/sign-up",
            body: {
                email: "a@example.com",
                password,
                firstName: "Test",
                lastName: "Guest",
            },
        });

        expect(response.statusCode).toBe(400);
        expect(findAuthCookie(response)).toBeUndefined();
    });

    it("accepts passwords of exactly 8 and 72 characters", async () => {
        const short = await signUp(server, {
            email: "eight@example.com",
            password: "a".repeat(8),
        });
        const long = await signUp(server, {
            email: "seventy-two@example.com",
            password: "a".repeat(72),
        });

        expect(short.response.statusCode).toBe(201);
        expect(long.response.statusCode).toBe(201);
    });

    it("sign-out clears the cookie and /me then returns 401", async () => {
        const { cookie } = await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        const signOut = await server.inject({
            method: "POST",
            url: "/api/auth/sign-out",
            cookies: authCookies(cookie),
        });
        const cleared = findAuthCookie(signOut);

        expect(signOut.statusCode).toBe(204);
        expect(cleared).toMatchObject({ value: "", path: "/" });
        expect(cleared?.expires?.getTime()).toBeLessThanOrEqual(Date.now());

        const me = await server.inject({
            method: "GET",
            url: "/api/auth/me",
            cookies: authCookies(cleared?.value ?? ""),
        });

        expect(me.statusCode).toBe(401);
    });

    it("GET /api/auth/me returns 401 without a cookie and with a forged token", async () => {
        const missing = await server.inject({
            method: "GET",
            url: "/api/auth/me",
        });
        const forged = await server.inject({
            method: "GET",
            url: "/api/auth/me",
            cookies: authCookies(
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciJ9.c2lnbmF0dXJl"
            ),
        });

        expect(missing.statusCode).toBe(401);
        expect(forged.statusCode).toBe(401);
        expect(forged.json()).toEqual(missing.json());
    });

    it("returns 401 for a valid token whose user no longer exists", async () => {
        const { id, cookie } = await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        await server.prisma.user.delete({ where: { id } });

        const response = await server.inject({
            method: "GET",
            url: "/api/auth/me",
            cookies: authCookies(cookie),
        });

        expect(response.statusCode).toBe(401);
    });

    it("rate-limits sign-in to 5 attempts per minute per IP with 429", async () => {
        const attempts = Array.from({ length: AUTH_RATE_LIMIT_MAX + 1 });
        const statuses: number[] = [];

        for (const _attempt of attempts) {
            const response = await signIn(server, {
                email: "nobody@example.com",
                password: "nope-nope",
            });

            statuses.push(response.statusCode);
        }

        expect(statuses.slice(0, AUTH_RATE_LIMIT_MAX)).toEqual(
            Array.from({ length: AUTH_RATE_LIMIT_MAX }, () => 401)
        );
        expect(statuses.at(-1)).toBe(429);
    });
});

describe("per-email sign-in limit", () => {
    let server: FastifyInstance;

    beforeEach(async () => {
        server = await configureServer();

        return async () => {
            await server.close();
        };
    });

    const signInFrom = (
        ip: string,
        body: { email: string; password: string }
    ) =>
        server.inject({
            method: "POST",
            url: "/api/auth/sign-in",
            headers: { "x-forwarded-for": ip },
            body,
        });

    it("answers the 11th sign-in for one email within the window with 429, even from a new IP", async () => {
        await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        const attempts = Array.from(
            { length: SIGN_IN_EMAIL_RATE_LIMIT_MAX },
            (_unused, index) => index
        );

        const statuses: number[] = [];

        for (const index of attempts) {
            const response = await signInFrom(`203.0.113.${index + 1}`, {
                email: index % 2 === 0 ? "a@example.com" : "  A@Example.COM ",
                password: "nope-nope",
            });

            statuses.push(response.statusCode);
        }

        expect(statuses).toEqual(attempts.map(() => 401));

        const blocked = await signInFrom("198.51.100.77", {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toMatchObject({
            statusCode: 429,
            message: RESPONSE_MESSAGES.common.tooManyRequests,
        });
        expect(findAuthCookie(blocked)).toBeUndefined();

        const otherEmail = await signInFrom("198.51.100.78", {
            email: "b@example.com",
            password: "nope-nope",
        });

        expect(otherEmail.statusCode).toBe(401);
    });

    it("gives an unknown email the same 429 body as a known one", async () => {
        await signUp(server, {
            email: "a@example.com",
            password: DEFAULT_PASSWORD,
        });

        const exhaust = async (email: string, subnet: number) => {
            for (
                let index = 0;
                index < SIGN_IN_EMAIL_RATE_LIMIT_MAX;
                index += 1
            ) {
                await signInFrom(`203.0.${subnet}.${index + 1}`, {
                    email,
                    password: "nope-nope",
                });
            }

            return signInFrom(`198.51.${subnet}.1`, {
                email,
                password: "nope-nope",
            });
        };

        const known = await exhaust("a@example.com", 1);
        const unknown = await exhaust("ghost@example.com", 2);

        expect(known.statusCode).toBe(429);
        expect(unknown.statusCode).toBe(429);
        expect(unknown.json()).toEqual(known.json());
    });
});
