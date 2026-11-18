/**
 * Single source of truth for every message returned to the client.
 * Grouped by module.
 */
export const RESPONSE_MESSAGES = {
    common: {
        tooManyRequests: "Too many requests. Try again in a minute.",
    },
    auth: {
        unauthorized: "Unauthorized.",
        invalidCredentials: "Invalid email or password",
        emailTaken: "An account with this email already exists.",
    },
    user: {
        notFound: "User not found.",
    },
    prebook: {
        notFound: "Prebook not found.",
    },
    booking: {
        notFound: "Booking not found.",
        prebookUsed:
            "This price confirmation has already been used. Please start a new booking.",
        offerMismatch: "The offer does not match the selected hotel and dates.",
        notConfirmed:
            "We could not confirm your booking. It may still go through, so please wait a few minutes before trying again.",
    },
    chat: {
        disabled:
            "The concierge is unavailable right now. Please contact the property directly.",
        dailyLimit:
            "You have reached today's concierge limit. Try again tomorrow.",
    },
    ai: {
        upstream: "The concierge could not answer right now. Please try again.",
        timeout: "The concierge took too long to answer. Please try again.",
    },
    stay: {
        checkoutBeforeCheckin: "Check-out must be after check-in.",
        tooManyNights: "Stays can be up to 30 nights.",
        checkinInPast: "Check-in cannot be in the past.",
        checkinTooFar: "Check-in must be within 365 days.",
    },
    liteapi: {
        upstream: "The hotel provider is unavailable. Please try again.",
        timeout:
            "The hotel provider took too long to respond. Please try again.",
        soldOut: "This offer is no longer available.",
        notFound: "The requested hotel or booking was not found.",
        busy: "The hotel provider is busy. Please try again in a minute.",
        searchBusy: "Hotel search is busy. Try again in a moment.",
    },
} as const;
