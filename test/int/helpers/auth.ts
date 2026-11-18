import { FastifyInstance, LightMyRequestResponse } from "fastify";
import { AUTH_COOKIE_NAME } from "@/lib/constants/auth.constant.js";

export type Credentials = {
    email: string;
    password: string;
};

export type SignedUpUser = {
    id: string;
    cookie: string;
    response: LightMyRequestResponse;
};

export const DEFAULT_PASSWORD = "password1";

type ResponseCookie = LightMyRequestResponse["cookies"][number];

export const findAuthCookie = (
    response: LightMyRequestResponse
): ResponseCookie | undefined =>
    response.cookies.find((entry) => entry.name === AUTH_COOKIE_NAME);

/**
 * Signs up through the public API and returns the user id with the raw
 * `access_token` value, ready for `inject({ cookies: authCookies(cookie) })`.
 */
export const signUp = async (
    server: FastifyInstance,
    { email, password }: Credentials
): Promise<SignedUpUser> => {
    const response = await server.inject({
        method: "POST",
        url: "/api/auth/sign-up",
        body: { email, password, firstName: "Test", lastName: "Guest" },
    });

    const cookie = findAuthCookie(response);

    if (response.statusCode !== 201 || !cookie) {
        throw new Error(
            `Sign-up failed in test setup: ${response.statusCode} ${response.body}`
        );
    }

    const { user } = response.json<{ user: { id: string } }>();

    return { id: user.id, cookie: cookie.value, response };
};

export const authCookies = (cookie: string): Record<string, string> => ({
    [AUTH_COOKIE_NAME]: cookie,
});
