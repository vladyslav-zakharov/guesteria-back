import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { ChatMessage, ChatRole, PrismaClient } from "@prisma/client";

/**
 * Owner-scoped on purpose: every read filters by both booking and user.
 * Callers must verify booking ownership before `createExchange`.
 */
export type ChatMessageRepository = {
    listOwned: (where: {
        bookingId: string;
        userId: string;
        take: number;
    }) => Promise<ChatMessage[]>;
    createExchange: (input: {
        bookingId: string;
        userId: string;
        question: string;
        answer: string;
        askedAt: Date;
        answeredAt: Date;
    }) => Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>;
};

export const createChatMessageRepository = (
    prisma: PrismaClient
): ChatMessageRepository => ({
    listOwned: async ({ bookingId, userId, take }) => {
        const latest = await prisma.chatMessage.findMany({
            where: { bookingId, userId },
            orderBy: { createdAt: "desc" },
            take,
        });

        return latest.reverse();
    },

    createExchange: async ({
        bookingId,
        userId,
        question,
        answer,
        askedAt,
        answeredAt,
    }) => {
        const [userMessage, assistantMessage] = await prisma.$transaction([
            prisma.chatMessage.create({
                data: {
                    bookingId,
                    userId,
                    role: ChatRole.USER,
                    content: question,
                    createdAt: askedAt,
                },
            }),
            prisma.chatMessage.create({
                data: {
                    bookingId,
                    userId,
                    role: ChatRole.ASSISTANT,
                    content: answer,
                    createdAt: answeredAt,
                },
            }),
        ]);

        return { userMessage, assistantMessage };
    },
});

addDIResolverName(createChatMessageRepository, "chatMessageRepository");
