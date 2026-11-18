import { z } from "zod";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const SIGN_IN_PASSWORD_MIN_LENGTH = 1;
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 50;

const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(EMAIL_MAX_LENGTH));

const userSchema = z.object({
    id: z.uuid(),
    email: z.email(),
    firstName: z.string(),
    lastName: z.string(),
});

type AuthUser = z.infer<typeof userSchema>;

const signUpBodySchema = z.object({
    email: emailSchema,
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    firstName: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
    lastName: z.string().trim().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
});

type SignUpInput = z.infer<typeof signUpBodySchema>;

const signInBodySchema = z.object({
    email: emailSchema,
    password: z
        .string()
        .min(SIGN_IN_PASSWORD_MIN_LENGTH)
        .max(PASSWORD_MAX_LENGTH),
});

type SignInInput = z.infer<typeof signInBodySchema>;

/**
 * Reads the already-normalised email back from a parsed sign-in body, for the
 * per-email rate limit key.
 */
const signInEmailSchema = signInBodySchema.pick({ email: true });

const authUserResponseSchema = z.object({
    user: userSchema,
});

type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

export {
    userSchema,
    signUpBodySchema,
    signInBodySchema,
    signInEmailSchema,
    authUserResponseSchema,
};

export type { AuthUser, SignUpInput, SignInInput, AuthUserResponse };
