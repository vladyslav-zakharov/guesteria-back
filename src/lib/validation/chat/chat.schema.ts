import { z } from "zod";

const CONTENT_MIN_LENGTH = 1;
const CONTENT_MAX_LENGTH = 1000;
const CHAT_MESSAGE_ROLES = ["user", "assistant"] as const;

const sendMessageBodySchema = z.object({
    content: z.string().trim().min(CONTENT_MIN_LENGTH).max(CONTENT_MAX_LENGTH),
});

type SendMessageInput = z.infer<typeof sendMessageBodySchema>;

const chatMessageDtoSchema = z.object({
    id: z.uuid(),
    role: z.enum(CHAT_MESSAGE_ROLES),
    content: z.string(),
    createdAt: z.iso.datetime(),
});

type ChatMessageDto = z.infer<typeof chatMessageDtoSchema>;

const remainingTodaySchema = z.number().int().min(0);

const chatMessagesResponseSchema = z.object({
    messages: z.array(chatMessageDtoSchema),
    remainingToday: remainingTodaySchema,
});

type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

const sendMessageResponseSchema = z.object({
    userMessage: chatMessageDtoSchema,
    assistantMessage: chatMessageDtoSchema,
    remainingToday: remainingTodaySchema,
});

type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>;

export {
    sendMessageBodySchema,
    chatMessageDtoSchema,
    chatMessagesResponseSchema,
    sendMessageResponseSchema,
};

export type {
    SendMessageInput,
    ChatMessageDto,
    ChatMessagesResponse,
    SendMessageResponse,
};
