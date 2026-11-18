import { FastifyBaseLogger } from "fastify";
import { mock } from "vitest-mock-extended";
import { describe, expect, it } from "vitest";
import { EnvConfig } from "@/types/env.type.js";
import { AiService } from "@/lib/ai/ai.type.js";
import {
    BadGatewayError,
    GatewayTimeoutError,
    NotFoundError,
} from "@/lib/errors/errors.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { createService } from "@/modules/chat/chat.service.js";
import { Booking, ChatMessage, Prisma } from "@prisma/client";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { BookingRepository } from "@/database/repositories/booking/booking.repository.js";
import { AiUsageRepository } from "@/database/repositories/ai-usage/ai-usage.repository.js";
import { ChatMessageRepository } from "@/database/repositories/chat-message/chat-message.repository.js";

const USER_ID = "0f5e2b9a-1c2d-4e3f-8a9b-7c6d5e4f3a21";
const BOOKING_ID = "b7f5d7e2-6a43-4b6e-9a9b-9d8c1c1f0a01";
const QUESTION = "Is breakfast included?";
const ANSWER = "Yes, breakfast is included.";

const booking: Booking = {
    id: BOOKING_ID,
    userId: USER_ID,
    prebookId: "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a",
    liteBookingId: "LITE-BOOKING-ID-123",
    hotelId: "lp1a2b3c",
    hotelName: "Casa Marina",
    hotelPhotoUrl: null,
    hotelAddress: "Carrer de Mar 1, Barcelona",
    roomName: "Double Room Sea View",
    boardName: "Breakfast included",
    checkin: new Date("2026-12-10T00:00:00Z"),
    checkout: new Date("2026-12-12T00:00:00Z"),
    adults: 2,
    childrenAges: [],
    amount: new Prisma.Decimal(250.5),
    currency: "EUR",
    refundable: false,
    cancellationDeadline: null,
    guestFirstName: "Olena",
    guestLastName: "Kovalenko",
    guestEmail: "olena@example.com",
    guestPhone: "+380501112233",
    specialRequests: null,
    status: "CONFIRMED",
    createdAt: new Date("2026-11-18T08:00:00Z"),
    updatedAt: new Date("2026-11-18T08:00:00Z"),
};

const message = (role: ChatMessage["role"], content: string): ChatMessage => ({
    id:
        role === "USER"
            ? "11111111-1111-4111-8111-111111111111"
            : "22222222-2222-4222-8222-222222222222",
    bookingId: BOOKING_ID,
    userId: USER_ID,
    role,
    content,
    createdAt: new Date("2026-11-18T09:00:00Z"),
});

type SetupOptions = {
    limit: number;
    globalLimit?: number;
    gcpProjectId?: string;
};

const setup = ({
    limit,
    globalLimit = 500,
    gcpProjectId = "test-project",
}: SetupOptions) => {
    const bookingRepository = mock<BookingRepository>();
    const chatMessageRepository = mock<ChatMessageRepository>();
    const aiUsageRepository = mock<AiUsageRepository>();
    const liteApiClient = mock<LiteApiClient>();
    const aiService = mock<AiService>();
    const log = mock<FastifyBaseLogger>();
    const config = {
        AI_DAILY_LIMIT: limit,
        AI_GLOBAL_DAILY_LIMIT: globalLimit,
        GCP_PROJECT_ID: gcpProjectId,
    } as EnvConfig;

    bookingRepository.findOwned.mockResolvedValue(booking);
    chatMessageRepository.listOwned.mockResolvedValue([]);
    liteApiClient.getHotel.mockRejectedValue(new Error("not stubbed"));
    aiService.generateConciergeReply.mockResolvedValue(ANSWER);
    aiUsageRepository.getTotalCount.mockResolvedValue(0);
    chatMessageRepository.createExchange.mockResolvedValue({
        userMessage: message("USER", QUESTION),
        assistantMessage: message("ASSISTANT", ANSWER),
    });

    return {
        bookingRepository,
        chatMessageRepository,
        aiUsageRepository,
        liteApiClient,
        aiService,
        log,
        service: createService(
            bookingRepository,
            chatMessageRepository,
            aiUsageRepository,
            liteApiClient,
            aiService,
            config,
            log
        ),
    };
};

const input = { userId: USER_ID, bookingId: BOOKING_ID, content: QUESTION };

describe("chatService.sendMessage", () => {
    it("answers under the cap and stores the exchange", async () => {
        const deps = setup({ limit: 30 });

        deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(5);

        const result = await deps.service.sendMessage(input);

        expect(deps.aiService.generateConciergeReply).toHaveBeenCalledTimes(1);
        expect(deps.chatMessageRepository.createExchange).toHaveBeenCalledTimes(
            1
        );
        expect(deps.chatMessageRepository.createExchange).toHaveBeenCalledWith(
            expect.objectContaining({
                bookingId: BOOKING_ID,
                userId: USER_ID,
                question: QUESTION,
                answer: ANSWER,
            })
        );
        expect(result.remainingToday).toBe(25);
        expect(result.userMessage).toMatchObject({
            role: "user",
            content: QUESTION,
        });
        expect(result.assistantMessage).toMatchObject({
            role: "assistant",
            content: ANSWER,
        });
        expect(deps.bookingRepository.findOwned).toHaveBeenCalledWith({
            id: BOOKING_ID,
            userId: USER_ID,
        });
    });

    it("rejects with 429 DAILY_LIMIT_REACHED over the cap without calling the model", async () => {
        const deps = setup({ limit: 30 });

        deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(31);

        await expect(deps.service.sendMessage(input)).rejects.toMatchObject({
            statusCode: 429,
            code: "DAILY_LIMIT_REACHED",
            message: RESPONSE_MESSAGES.chat.dailyLimit,
        });

        expect(deps.aiService.generateConciergeReply).not.toHaveBeenCalled();
        expect(
            deps.chatMessageRepository.createExchange
        ).not.toHaveBeenCalled();
    });

    it("rejects with 503 when the limit is 0, after the ownership check and before any usage, LiteAPI or model call", async () => {
        const deps = setup({ limit: 0 });

        await expect(deps.service.sendMessage(input)).rejects.toMatchObject({
            statusCode: 503,
        });

        expect(deps.bookingRepository.findOwned).toHaveBeenCalledWith({
            id: BOOKING_ID,
            userId: USER_ID,
        });
        expect(deps.liteApiClient.getHotel).not.toHaveBeenCalled();
        expect(deps.chatMessageRepository.listOwned).not.toHaveBeenCalled();
        expect(deps.aiUsageRepository.getTotalCount).not.toHaveBeenCalled();
        expect(
            deps.aiUsageRepository.incrementAndGetCount
        ).not.toHaveBeenCalled();
        expect(deps.aiService.generateConciergeReply).not.toHaveBeenCalled();
    });

    it.each([
        ["the limit is 0", { limit: 0 }],
        ["GCP_PROJECT_ID is missing", { limit: 30, gcpProjectId: "" }],
    ])(
        "rejects another user's booking with 404, not 503, when %s",
        async (_label, options) => {
            const deps = setup(options);

            deps.bookingRepository.findOwned.mockRejectedValueOnce(
                new NotFoundError(RESPONSE_MESSAGES.booking.notFound)
            );

            await expect(deps.service.sendMessage(input)).rejects.toMatchObject(
                {
                    statusCode: 404,
                    message: RESPONSE_MESSAGES.booking.notFound,
                }
            );

            expect(
                deps.aiUsageRepository.incrementAndGetCount
            ).not.toHaveBeenCalled();
            expect(
                deps.aiService.generateConciergeReply
            ).not.toHaveBeenCalled();
        }
    );

    it("rejects with 429 DAILY_LIMIT_REACHED at the global ceiling without counting usage or calling the model", async () => {
        const deps = setup({ limit: 30, globalLimit: 500 });

        deps.aiUsageRepository.getTotalCount.mockResolvedValueOnce(500);

        await expect(deps.service.sendMessage(input)).rejects.toMatchObject({
            statusCode: 429,
            code: "DAILY_LIMIT_REACHED",
            message: RESPONSE_MESSAGES.chat.dailyLimit,
        });

        expect(deps.aiUsageRepository.getTotalCount).toHaveBeenCalledWith({
            day: expect.any(Date),
        });
        expect(deps.liteApiClient.getHotel).not.toHaveBeenCalled();
        expect(deps.chatMessageRepository.listOwned).not.toHaveBeenCalled();
        expect(
            deps.aiUsageRepository.incrementAndGetCount
        ).not.toHaveBeenCalled();
        expect(deps.aiService.generateConciergeReply).not.toHaveBeenCalled();
    });

    it("counts the global usage for the current UTC day", async () => {
        const deps = setup({ limit: 30 });

        deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(1);

        await deps.service.sendMessage(input);

        const [{ day }] = deps.aiUsageRepository.getTotalCount.mock.calls[0];
        const [{ day: userDay }] =
            deps.aiUsageRepository.incrementAndGetCount.mock.calls[0];

        expect(day.toISOString()).toMatch(/T00:00:00\.000Z$/);
        expect(day).toEqual(userDay);
    });

    it("returns the smaller of the per-user and the global remaining count", async () => {
        const deps = setup({ limit: 30, globalLimit: 500 });

        deps.aiUsageRepository.getTotalCount.mockResolvedValueOnce(497);
        deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(5);

        const result = await deps.service.sendMessage(input);

        expect(result.remainingToday).toBe(2);
    });

    it("rejects with 503 without counting usage when GCP_PROJECT_ID is missing", async () => {
        const deps = setup({ limit: 30, gcpProjectId: "" });

        await expect(deps.service.sendMessage(input)).rejects.toMatchObject({
            statusCode: 503,
            message: RESPONSE_MESSAGES.chat.disabled,
        });

        expect(deps.liteApiClient.getHotel).not.toHaveBeenCalled();
        expect(
            deps.aiUsageRepository.incrementAndGetCount
        ).not.toHaveBeenCalled();
        expect(deps.aiService.generateConciergeReply).not.toHaveBeenCalled();
    });

    it.each([
        ["502", new BadGatewayError(RESPONSE_MESSAGES.ai.upstream), 502],
        ["504", new GatewayTimeoutError(RESPONSE_MESSAGES.ai.timeout), 504],
    ])(
        "passes a model %s through, keeps the attempt counted and stores no exchange",
        async (_label, modelError, statusCode) => {
            const deps = setup({ limit: 30 });

            deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(
                3
            );
            deps.aiService.generateConciergeReply.mockRejectedValueOnce(
                modelError
            );

            await expect(deps.service.sendMessage(input)).rejects.toMatchObject(
                {
                    statusCode,
                }
            );

            expect(
                deps.aiUsageRepository.incrementAndGetCount
            ).toHaveBeenCalledTimes(1);
            expect(
                deps.chatMessageRepository.createExchange
            ).not.toHaveBeenCalled();
        }
    );

    it("rejects with 404 for another user's booking without counting usage", async () => {
        const deps = setup({ limit: 30 });

        deps.bookingRepository.findOwned.mockRejectedValueOnce(
            new NotFoundError(RESPONSE_MESSAGES.booking.notFound)
        );

        await expect(deps.service.sendMessage(input)).rejects.toMatchObject({
            statusCode: 404,
        });

        expect(
            deps.aiUsageRepository.incrementAndGetCount
        ).not.toHaveBeenCalled();
        expect(deps.aiService.generateConciergeReply).not.toHaveBeenCalled();
    });

    it("still answers when the hotel lookup fails", async () => {
        const deps = setup({ limit: 30 });

        deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(1);

        const result = await deps.service.sendMessage(input);

        expect(deps.liteApiClient.getHotel).toHaveBeenCalledWith(
            booking.hotelId
        );
        expect(deps.aiService.generateConciergeReply).toHaveBeenCalledTimes(1);
        expect(result.assistantMessage.content).toBe(ANSWER);
        expect(result.remainingToday).toBe(29);
    });

    it("sends no guest PII or ids to the model", async () => {
        const deps = setup({ limit: 30 });

        deps.aiUsageRepository.incrementAndGetCount.mockResolvedValueOnce(1);

        await deps.service.sendMessage(input);

        const sent = JSON.stringify(
            deps.aiService.generateConciergeReply.mock.calls[0][0]
        );

        [
            "Olena",
            "Kovalenko",
            "olena@example.com",
            "+380501112233",
            BOOKING_ID,
            USER_ID,
            "LITE-BOOKING-ID-123",
            "lp1a2b3c",
        ].forEach((secret) => expect(sent).not.toContain(secret));
        expect(sent).toContain(QUESTION);
    });
});

describe("chatService.listMessages", () => {
    it("returns owned history and the remaining quota", async () => {
        const deps = setup({ limit: 30 });

        deps.chatMessageRepository.listOwned.mockResolvedValueOnce([
            message("USER", QUESTION),
        ]);
        deps.aiUsageRepository.getCount.mockResolvedValueOnce(4);

        const result = await deps.service.listMessages({
            userId: USER_ID,
            bookingId: BOOKING_ID,
        });

        expect(deps.chatMessageRepository.listOwned).toHaveBeenCalledWith({
            bookingId: BOOKING_ID,
            userId: USER_ID,
            take: 200,
        });
        expect(result.messages).toEqual([
            {
                id: "11111111-1111-4111-8111-111111111111",
                role: "user",
                content: QUESTION,
                createdAt: "2026-11-18T09:00:00.000Z",
            },
        ]);
        expect(result.remainingToday).toBe(26);
    });

    it("caps the remaining quota by the global ceiling", async () => {
        const deps = setup({ limit: 30, globalLimit: 500 });

        deps.aiUsageRepository.getCount.mockResolvedValueOnce(4);
        deps.aiUsageRepository.getTotalCount.mockResolvedValueOnce(510);

        const result = await deps.service.listMessages({
            userId: USER_ID,
            bookingId: BOOKING_ID,
        });

        expect(result.remainingToday).toBe(0);
    });

    it("returns 0 remaining when the feature is disabled, without reading usage", async () => {
        const deps = setup({ limit: 0 });

        const result = await deps.service.listMessages({
            userId: USER_ID,
            bookingId: BOOKING_ID,
        });

        expect(result.remainingToday).toBe(0);
        expect(deps.aiUsageRepository.getCount).not.toHaveBeenCalled();
        expect(deps.aiUsageRepository.getTotalCount).not.toHaveBeenCalled();
    });

    it("rejects with 404 for another user's booking", async () => {
        const deps = setup({ limit: 30 });

        deps.bookingRepository.findOwned.mockRejectedValueOnce(
            new NotFoundError(RESPONSE_MESSAGES.booking.notFound)
        );

        await expect(
            deps.service.listMessages({
                userId: USER_ID,
                bookingId: BOOKING_ID,
            })
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(deps.chatMessageRepository.listOwned).not.toHaveBeenCalled();
    });
});
