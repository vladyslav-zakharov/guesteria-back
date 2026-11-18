import { describe, expect, it } from "vitest";
import {
    signInBodySchema,
    signUpBodySchema,
} from "@/lib/validation/auth/auth.schema.js";

describe("auth email schema", () => {
    it("trims and lower-cases the sign-in email before validating it", () => {
        const result = signInBodySchema.parse({
            email: "  Olena@Example.COM \n",
            password: "password1",
        });

        expect(result.email).toBe("olena@example.com");
    });

    it("trims and lower-cases the sign-up email before validating it", () => {
        const result = signUpBodySchema.parse({
            email: " A@Example.com ",
            password: "password1",
            firstName: "Olena",
            lastName: "Kovalenko",
        });

        expect(result.email).toBe("a@example.com");
    });

    it("still rejects an invalid email", () => {
        expect(
            signInBodySchema.safeParse({
                email: "  not-an-email  ",
                password: "x",
            }).success
        ).toBe(false);
    });
});
