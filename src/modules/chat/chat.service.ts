import { randomBytes } from "node:crypto";
import { FastifyBaseLogger } from "fastify";
import { EnvConfig } from "@/types/env.type.js";
import { AiService } from "@/lib/ai/ai.type.js";
import { getUtcDayStart } from "@/lib/dates/dates.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { toHotelDetails } from "@/lib/liteapi/liteapi.mapper.js";
import { DATA_FENCE_NONCE_BYTES } from "@/lib/ai/ai.constant.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { BookingRepository } from "@/database/repositories/booking/booking.repository.js";
import {
    CHAT_HISTORY_LIMIT,
    CONCIERGE_HISTORY_LIMIT,
} from "./chat.constant.js";
import {
    DailyLimitError,
    ServiceUnavailableError,
} from "@/lib/errors/errors.js";
import { AiUsageRepository } from "@/database/repositories/ai-usage/ai-usage.repository.js";
import { ChatMessageRepository } from "@/database/repositories/chat-message/chat-message.repository.js";
import {
    ChatMessagesResponse,
    SendMessageResponse,
} from "@/lib/validation/chat/chat.schema.js";
import {
    buildConciergeContext,
    buildConciergeTurns,
    buildSystemInstruction,
    toChatMessageDto,
    toRemainingToday,
} from "./chat.util.js";

export type ListMessagesPayload = {
    userId: string;
    bookingId: string;
};

export type SendMessagePayload = {
    userId: string;
    bookingId: string;
    content: string;
};

export type ChatService = {
    listMessages: (
        payload: ListMessagesPayload
    ) => Promise<ChatMessagesResponse>;
    sendMessage: (payload: SendMessagePayload) => Promise<SendMessageResponse>;
};

export const createService = (
    bookingRepository: BookingRepository,
    chatMessageRepository: ChatMessageRepository,
    aiUsageRepository: AiUsageRepository,
    liteApiClient: LiteApiClient,
    aiService: AiService,
    config: EnvConfig,
    log: FastifyBaseLogger
): ChatService => ({
    listMessages: async ({ userId, bookingId }) => {
        const limit = config.AI_DAILY_LIMIT;

        await bookingRepository.findOwned({ id: bookingId, userId });

        const messages = await chatMessageRepository.listOwned({
            bookingId,
            userId,
            take: CHAT_HISTORY_LIMIT,
        });

        if (limit <= 0) {
            return {
                messages: messages.map(toChatMessageDto),
                remainingToday: 0,
            };
        }

        const day = getUtcDayStart(new Date());

        const [used, globalUsed] = await Promise.all([
            aiUsageRepository.getCount({ userId, day }),
            aiUsageRepository.getTotalCount({ day }),
        ]);

        return {
            messages: messages.map(toChatMessageDto),
            remainingToday: toRemainingToday({
                limit,
                used,
                globalLimit: config.AI_GLOBAL_DAILY_LIMIT,
                globalUsed,
            }),
        };
    },

    /**
     * Ownership (404 for another user's booking, AC 8) → kill switch and AI
     * config (503, no usage counted) → global ceiling (before any LiteAPI
     * call) → hotel context and history in parallel → atomic per-user
     * increment right before the model call → store the
     * exchange. A failed model call still counts against the daily cap (the
     * increment is the gate that stops concurrent requests from all passing
     * it). The global ceiling is read before the increment, so a request it
     * rejects does not use up the guest's own attempts; concurrent requests
     * can overshoot it by at most the number in flight.
     */
    sendMessage: async ({ userId, bookingId, content }) => {
        const limit = config.AI_DAILY_LIMIT;
        const globalLimit = config.AI_GLOBAL_DAILY_LIMIT;

        const booking = await bookingRepository.findOwned({
            id: bookingId,
            userId,
        });

        if (limit <= 0) {
            throw new ServiceUnavailableError(RESPONSE_MESSAGES.chat.disabled);
        }

        if (!config.GCP_PROJECT_ID) {
            log.error(
                "GCP_PROJECT_ID is not configured; the AI chat is unavailable"
            );

            throw new ServiceUnavailableError(RESPONSE_MESSAGES.chat.disabled);
        }

        const askedAt = new Date();
        const day = getUtcDayStart(askedAt);

        const globalUsed = await aiUsageRepository.getTotalCount({ day });

        if (globalUsed >= globalLimit) {
            log.warn({ globalLimit }, "Concierge global daily limit reached");

            throw new DailyLimitError(RESPONSE_MESSAGES.chat.dailyLimit);
        }

        const [hotel, history] = await Promise.all([
            liteApiClient
                .getHotel(booking.hotelId)
                .then(toHotelDetails)
                .catch((error: unknown) => {
                    log.warn(
                        {
                            bookingId,
                            statusCode:
                                error instanceof Error && "statusCode" in error
                                    ? error.statusCode
                                    : null,
                        },
                        "Hotel data unavailable; the concierge answers from the booking only"
                    );

                    return null;
                }),
            chatMessageRepository.listOwned({
                bookingId,
                userId,
                take: CONCIERGE_HISTORY_LIMIT,
            }),
        ]);

        const count = await aiUsageRepository.incrementAndGetCount({
            userId,
            day,
        });

        if (count > limit) {
            log.warn({ userId, limit }, "Concierge daily limit reached");

            throw new DailyLimitError(RESPONSE_MESSAGES.chat.dailyLimit);
        }

        const answer = await aiService.generateConciergeReply({
            systemInstruction: buildSystemInstruction({
                context: buildConciergeContext({ booking, hotel }),
                nonce: randomBytes(DATA_FENCE_NONCE_BYTES).toString("hex"),
            }),
            turns: buildConciergeTurns({ history, question: content }),
        });

        const { userMessage, assistantMessage } =
            await chatMessageRepository.createExchange({
                bookingId,
                userId,
                question: content,
                answer,
                askedAt,
                answeredAt: new Date(),
            });

        return {
            userMessage: toChatMessageDto(userMessage),
            assistantMessage: toChatMessageDto(assistantMessage),
            remainingToday: toRemainingToday({
                limit,
                used: count,
                globalLimit,
                globalUsed: globalUsed + 1,
            }),
        };
    },
});

addDIResolverName(createService, "chatService");
