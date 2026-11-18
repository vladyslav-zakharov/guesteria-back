export const AUTH_RATE_LIMIT_MAX = 5;

export const AUTH_RATE_LIMIT_TIME_WINDOW = "1 minute";

export const SIGN_IN_EMAIL_RATE_LIMIT_MAX = 10;

export const SIGN_IN_EMAIL_RATE_LIMIT_TIME_WINDOW = "15 minutes";

/**
 * argon2id hash of a random secret nobody knows, with the same parameters as
 * `hashing.hashPassword`. Sign-in verifies against it when the email is unknown,
 * so the response time does not reveal whether the account exists.
 */
export const DUMMY_PASSWORD_HASH =
    "$argon2id$v=19$m=65536,t=3,p=4$Iyj2sReUaRyEXivYntQQBg$ESajZ1+Y7dvLwyqlggyiNus35qrDzjyz+FkffaeGWU0";

export const UNIQUE_CONSTRAINT_ERROR_CODE = "P2002";

export const SIGN_OUT_STATUS_CODE = 204;

export const AUTH_USER_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
} as const;
