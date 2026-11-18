import { ChatService } from "./chat.service.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { CREATED_STATUS_CODE } from "@/lib/constants/http.constant.js";
import { SendMessageInput } from "@/lib/validation/chat/chat.schema.js";
import { BookingParams } from "@/lib/validation/bookings/bookings.schema.js";

export type ChatHandler = {
    listMessages: (
        request: FastifyRequest<{ Params: BookingParams }>,
        reply: FastifyReply
    ) => Promise<void>;
    sendMessage: (
        request: FastifyRequest<{
            Params: BookingParams;
            Body: SendMessageInput;
        }>,
        reply: FastifyReply
    ) => Promise<void>;
};

export const createHandler = (chatService: ChatService): ChatHandler => {
    return {
        listMessages: async (request, reply) => {
            const result = await chatService.listMessages({
                userId: request.user.id,
                bookingId: request.params.bookingId,
            });

            return reply.send(result);
        },

        sendMessage: async (request, reply) => {
            const result = await chatService.sendMessage({
                userId: request.user.id,
                bookingId: request.params.bookingId,
                content: request.body.content,
            });

            return reply.status(CREATED_STATUS_CODE).send(result);
        },
    };
};

addDIResolverName(createHandler, "chatHandler");
