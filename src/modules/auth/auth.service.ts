import { Prisma } from "@prisma/client";
import { hashing } from "@/lib/hashing/hashing.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { ConflictError, UnauthorizedError } from "@/lib/errors/errors.js";
import { UserRepository } from "@/database/repositories/user/user.repository.js";
import {
    AuthUser,
    SignInInput,
    SignUpInput,
} from "@/lib/validation/auth/auth.schema.js";
import {
    AUTH_USER_SELECT,
    DUMMY_PASSWORD_HASH,
    UNIQUE_CONSTRAINT_ERROR_CODE,
} from "./auth.constant.js";

export type SignUpPayload = {
    payload: SignUpInput;
};

export type SignInPayload = {
    payload: SignInInput;
};

export type AuthService = {
    signUp: (payload: SignUpPayload) => Promise<AuthUser>;
    signIn: (payload: SignInPayload) => Promise<AuthUser>;
};

export const createService = (userRepository: UserRepository): AuthService => ({
    signUp: async ({ payload }) => {
        const { email, password, firstName, lastName } = payload;

        const existing = await userRepository.findByEmail(email);

        if (existing) {
            throw new ConflictError(RESPONSE_MESSAGES.auth.emailTaken);
        }

        const passwordHash = await hashing.hashPassword(password);

        try {
            return await userRepository.create({
                data: { email, passwordHash, firstName, lastName },
                select: AUTH_USER_SELECT,
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === UNIQUE_CONSTRAINT_ERROR_CODE
            ) {
                throw new ConflictError(RESPONSE_MESSAGES.auth.emailTaken);
            }

            throw error;
        }
    },

    /**
     * Unknown email and wrong password produce the same 401. An unknown email
     * still runs one argon2 verify against a dummy hash, so timing does not
     * reveal which field is wrong.
     */
    signIn: async ({ payload }) => {
        const { email, password } = payload;

        const user = await userRepository.findByEmail(email);

        const isPasswordValid = await hashing.comparePassword({
            password,
            hash: user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        });

        if (!user || !isPasswordValid) {
            throw new UnauthorizedError(
                RESPONSE_MESSAGES.auth.invalidCredentials
            );
        }

        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
        };
    },
});

addDIResolverName(createService, "authService");
