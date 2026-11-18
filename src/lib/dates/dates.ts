import { dayjs } from "./dayjs.js";
import { StayRange } from "./dates.type.js";
import { STAY_DATE_FORMAT } from "@/lib/constants/date.constant.js";

/**
 * Stay dates are hotel-local calendar days without a timezone. They are stored
 * as `@db.Date` and handled as UTC midnight, so no local offset can shift them.
 */
export const toStayDate = (date: Date): string =>
    dayjs.utc(date).format(STAY_DATE_FORMAT);

/**
 * Strict `YYYY-MM-DD` parse at UTC midnight. An impossible date such as
 * `2026-02-30` gives an Invalid Date instead of rolling over.
 */
export const fromStayDate = (date: string): Date =>
    dayjs.utc(date, STAY_DATE_FORMAT, true).toDate();

export const countNights = ({ checkin, checkout }: StayRange): number =>
    dayjs
        .utc(checkout, STAY_DATE_FORMAT, true)
        .diff(dayjs.utc(checkin, STAY_DATE_FORMAT, true), "day");

export const getUtcDayStart = (now: Date): Date =>
    dayjs.utc(now).startOf("day").toDate();

export const getTodayStayDate = (): string =>
    dayjs.utc().format(STAY_DATE_FORMAT);
