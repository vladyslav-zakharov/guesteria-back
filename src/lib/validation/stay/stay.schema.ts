import { z } from "zod";
import { countNights, getTodayStayDate } from "@/lib/dates/dates.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";

export const STAY_LIMITS = {
    maxNights: 30,
    maxAdvanceDays: 365,
    minAdults: 1,
    maxAdults: 8,
    maxChildren: 4,
    maxChildAge: 17,
} as const;

const INTEGER_PATTERN = /^\d+$/;
const CHILDREN_PATTERN = /^(\d+(,\d+)*)?$/;
const CHILDREN_SEPARATOR = ",";

const toChildAges = (value: string | undefined): number[] =>
    value ? value.split(CHILDREN_SEPARATOR).map(Number) : [];

/**
 * Stay params arrive as query strings. Numbers are parsed only from plain
 * digits, so "", "1e1" or "2.5" are rejected instead of coerced.
 */
const stayQueryShape = {
    checkin: z.iso.date(),
    checkout: z.iso.date(),
    adults: z
        .string()
        .regex(INTEGER_PATTERN)
        .transform(Number)
        .pipe(
            z
                .number()
                .int()
                .min(STAY_LIMITS.minAdults)
                .max(STAY_LIMITS.maxAdults)
        ),
    children: z
        .string()
        .regex(CHILDREN_PATTERN)
        .optional()
        .transform(toChildAges)
        .pipe(
            z
                .array(z.number().int().min(0).max(STAY_LIMITS.maxChildAge))
                .max(STAY_LIMITS.maxChildren)
        ),
};

type StayDates = Pick<
    z.infer<z.ZodObject<typeof stayQueryShape>>,
    "checkin" | "checkout"
>;

/**
 * The cross-field stay rules, shared by every schema that carries a stay
 * (the hotel search query and the prebook body): check-out after check-in,
 * at most 30 nights, check-in from today to +365 days. `today` is read on
 * every parse (not once at startup) and is injectable for tests. "Today" is
 * the UTC calendar day.
 */
const refineStay =
    ({ today }: { today: () => string }) =>
        ({ checkin, checkout }: StayDates, ctx: z.RefinementCtx): void => {
            const nights = countNights({ checkin, checkout });
            const daysAhead = countNights({ checkin: today(), checkout: checkin });

            if (Number.isNaN(nights) || nights < 1) {
                ctx.addIssue({
                    code: "custom",
                    path: ["checkout"],
                    message: RESPONSE_MESSAGES.stay.checkoutBeforeCheckin,
                });
            }

            if (nights > STAY_LIMITS.maxNights) {
                ctx.addIssue({
                    code: "custom",
                    path: ["checkout"],
                    message: RESPONSE_MESSAGES.stay.tooManyNights,
                });
            }

            if (Number.isNaN(daysAhead) || daysAhead < 0) {
                ctx.addIssue({
                    code: "custom",
                    path: ["checkin"],
                    message: RESPONSE_MESSAGES.stay.checkinInPast,
                });
            }

            if (daysAhead > STAY_LIMITS.maxAdvanceDays) {
                ctx.addIssue({
                    code: "custom",
                    path: ["checkin"],
                    message: RESPONSE_MESSAGES.stay.checkinTooFar,
                });
            }
        };

const buildStayQuerySchema = ({ today }: { today: () => string }) =>
    z.object(stayQueryShape).superRefine(refineStay({ today }));

const stayQuerySchema = buildStayQuerySchema({ today: getTodayStayDate });

type StayQuery = z.infer<typeof stayQuerySchema>;

export { buildStayQuerySchema, refineStay, stayQuerySchema };

export type { StayQuery };
