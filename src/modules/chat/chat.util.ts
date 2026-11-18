import { ChatMessage } from "@prisma/client";
import { dayjs } from "@/lib/dates/dayjs.js";
import { ConciergeTurn } from "@/lib/ai/ai.type.js";
import { countNights, toStayDate } from "@/lib/dates/dates.js";
import { ChatMessageDto } from "@/lib/validation/chat/chat.schema.js";
import { HotelDetailsDto } from "@/lib/validation/hotels/hotels.schema.js";
import {
    CONCIERGE_SYSTEM_PROMPT,
    DATA_FENCE_BEGIN,
    DATA_FENCE_END,
} from "@/lib/ai/ai.constant.js";
import {
    ConciergeContextInput,
    ConciergeTurnsInput,
    CountLabelInput,
    RemainingTodayInput,
    SystemInstructionInput,
} from "./chat.type.js";
import {
    CANCELLATION_DEADLINE_FORMAT,
    CONCIERGE_HISTORY_LIMIT,
    DESCRIPTION_MAX_LENGTH,
    FACILITIES_MAX_COUNT,
    NOT_PROVIDED,
} from "./chat.constant.js";

const formatCount = ({ count, singular, plural }: CountLabelInput): string =>
    `${count} ${count === 1 ? singular : plural}`;

const toHotelLines = (hotel: HotelDetailsDto): string[] => [
    "HOTEL DATA",
    `Name: ${hotel.name}`,
    `Address: ${[hotel.address, hotel.city, hotel.country]
        .filter((part) => part.length > 0)
        .join(", ")}`,
    `Check-in time: ${hotel.checkinTime ?? NOT_PROVIDED}`,
    `Check-out time: ${hotel.checkoutTime ?? NOT_PROVIDED}`,
    `Facilities: ${
        hotel.facilities.slice(0, FACILITIES_MAX_COUNT).join(", ") ||
        NOT_PROVIDED
    }`,
    `Description: ${
        hotel.description.slice(0, DESCRIPTION_MAX_LENGTH) || NOT_PROVIDED
    }`,
];

/**
 * The PII-free facts the concierge may answer from. It never includes guest
 * names, email, phone, special requests, our ids or LiteAPI ids: only the
 * stay terms and public hotel data. Without hotel data (LiteAPI down) the
 * booking's own hotel name and address are used.
 */
export const buildConciergeContext = ({
    booking,
    hotel,
}: ConciergeContextInput): string => {
    const checkin = toStayDate(booking.checkin);
    const checkout = toStayDate(booking.checkout);

    const hotelLines = hotel
        ? toHotelLines(hotel)
        : [
            "HOTEL DATA",
            `Name: ${booking.hotelName}`,
            `Address: ${booking.hotelAddress}`,
            "Other hotel details are unavailable right now.",
        ];

    const cancellation = booking.refundable
        ? `Refundable: yes, free cancellation until ${
            booking.cancellationDeadline
                ? dayjs
                    .utc(booking.cancellationDeadline)
                    .format(CANCELLATION_DEADLINE_FORMAT)
                : NOT_PROVIDED
        }`
        : "Refundable: no";

    return [
        ...hotelLines,
        "",
        "BOOKING DATA",
        `Hotel: ${booking.hotelName}`,
        `Check-in date: ${checkin}`,
        `Check-out date: ${checkout}`,
        `Nights: ${countNights({ checkin, checkout })}`,
        `Room: ${booking.roomName}`,
        `Board: ${booking.boardName}`,
        `Guests: ${formatCount({
            count: booking.adults,
            singular: "adult",
            plural: "adults",
        })}, ${formatCount({
            count: booking.childrenAges.length,
            singular: "child",
            plural: "children",
        })}`,
        cancellation,
    ].join("\n");
};

/**
 * The concierge prompt followed by the context fenced with a per-request
 * nonce. The nonce is stripped from the context first, so nothing inside the
 * data can forge the closing marker.
 */
export const buildSystemInstruction = ({
    context,
    nonce,
}: SystemInstructionInput): string =>
    [
        CONCIERGE_SYSTEM_PROMPT,
        "",
        `${DATA_FENCE_BEGIN} ${nonce}`,
        context.split(nonce).join(""),
        `${DATA_FENCE_END} ${nonce}`,
    ].join("\n");

/**
 * The latest history messages (oldest first) without leading assistant turns,
 * because Gemini expects the conversation to start with the user, followed by
 * the new question.
 */
export const buildConciergeTurns = ({
    history,
    question,
}: ConciergeTurnsInput): ConciergeTurn[] => {
    const latest = history.slice(-CONCIERGE_HISTORY_LIMIT);
    const firstUserIndex = latest.findIndex(({ role }) => role === "USER");
    const kept = firstUserIndex === -1 ? [] : latest.slice(firstUserIndex);

    return [
        ...kept.map(
            ({ role, content }): ConciergeTurn => ({
                role: role === "USER" ? "user" : "model",
                text: content,
            })
        ),
        { role: "user", text: question },
    ];
};

export const toChatMessageDto = (message: ChatMessage): ChatMessageDto => ({
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
});

/**
 * Attempts left today: the smaller of the per-user and the global allowance,
 * never negative.
 */
export const toRemainingToday = ({
    limit,
    used,
    globalLimit,
    globalUsed,
}: RemainingTodayInput): number =>
    Math.max(0, Math.min(limit - used, globalLimit - globalUsed));
