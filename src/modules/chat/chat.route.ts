import { FastifyInstance } from "fastify";
import { ChatHandler } from "./chat.handler.js";
import {
    CHAT_RATE_LIMIT_TIME_WINDOW,
    SEND_MESSAGE_RATE_LIMIT_MAX,
} from "./chat.constant.js";
import {
    BookingParams,
    bookingParamsSchema,
} from "@/lib/validation/bookings/bookings.schema.js";
import {
    SendMessageInput,
    chatMessagesResponseSchema,
    sendMessageBodySchema,
    sendMessageResponseSchema,
} from "@/lib/validation/chat/chat.schema.js";

const CHAT_TAG = "chat";

enum ChatRoute {
    Messages = "/:bookingId/messages",
}

/**
 * `authorization` runs in `onRequest`, so an unauthenticated request gets 401
 * before params or body validation. The rate limiter stays in `preHandler`,
 * where `request.user` is set, so it is keyed by user id.
 */
export const createChatRoutes = (
    fastify: FastifyInstance,
    chatHandler: ChatHandler
) => {
    fastify.get<{ Params: BookingParams }>(
        ChatRoute.Messages,
        {
            onRequest: [fastify.authorization],
            schema: {
                tags: [CHAT_TAG],
                summary:
                    "List the concierge chat of one of the user's bookings (latest 200)",
                params: bookingParamsSchema,
                response: {
                    200: chatMessagesResponseSchema,
                },
            },
        },
        chatHandler.listMessages
    );

    fastify.post<{ Params: BookingParams; Body: SendMessageInput }>(
        ChatRoute.Messages,
        {
            onRequest: [fastify.authorization],
            preHandler: [
                fastify.rateLimit({
                    max: SEND_MESSAGE_RATE_LIMIT_MAX,
                    timeWindow: CHAT_RATE_LIMIT_TIME_WINDOW,
                }),
            ],
            schema: {
                tags: [CHAT_TAG],
                summary:
                    "Ask the AI concierge about one of the user's bookings",
                params: bookingParamsSchema,
                body: sendMessageBodySchema,
                response: {
                    201: sendMessageResponseSchema,
                },
            },
        },
        chatHandler.sendMessage
    );
};
