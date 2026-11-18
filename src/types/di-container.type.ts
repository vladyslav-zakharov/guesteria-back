import { EnvConfig } from "./env.type.js";
import { FastifyBaseLogger } from "fastify";
import { PrismaClient } from "@prisma/client";
import { AiService } from "@/lib/ai/ai.type.js";
import { ChatService } from "@/modules/chat/chat.service.js";
import { ChatHandler } from "@/modules/chat/chat.handler.js";
import { AuthService } from "@/modules/auth/auth.service.js";
import { AuthHandler } from "@/modules/auth/auth.handler.js";
import { LiteApiClient } from "@/lib/liteapi/liteapi.type.js";
import { HotelsService } from "@/modules/hotels/hotels.service.js";
import { HotelsHandler } from "@/modules/hotels/hotels.handler.js";
import { PlacesService } from "@/modules/places/places.service.js";
import { PlacesHandler } from "@/modules/places/places.handler.js";
import { BookingsService } from "@/modules/bookings/bookings.service.js";
import { BookingsHandler } from "@/modules/bookings/bookings.handler.js";
import { UserRepository } from "@/database/repositories/user/user.repository.js";
import { ApplicationService } from "@/modules/application/application.service.js";
import { ApplicationHandler } from "@/modules/application/application.handler.js";
import { BookingRepository } from "@/database/repositories/booking/booking.repository.js";
import { PrebookRepository } from "@/database/repositories/prebook/prebook.repository.js";
import { AiUsageRepository } from "@/database/repositories/ai-usage/ai-usage.repository.js";
import { ChatMessageRepository } from "@/database/repositories/chat-message/chat-message.repository.js";

export type Cradle = {
    log: FastifyBaseLogger;
    prisma: PrismaClient;
    config: EnvConfig;

    chatService: ChatService;
    chatHandler: ChatHandler;

    bookingsService: BookingsService;
    bookingsHandler: BookingsHandler;
    liteApiClient: LiteApiClient;
    aiService: AiService;

    hotelsService: HotelsService;
    hotelsHandler: HotelsHandler;

    placesService: PlacesService;
    placesHandler: PlacesHandler;

    authService: AuthService;
    authHandler: AuthHandler;

    aiUsageRepository: AiUsageRepository;

    chatMessageRepository: ChatMessageRepository;

    bookingRepository: BookingRepository;

    prebookRepository: PrebookRepository;

    userRepository: UserRepository;

    applicationService: ApplicationService;
    applicationHandler: ApplicationHandler;
};
