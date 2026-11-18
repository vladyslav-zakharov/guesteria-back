import { Booking, ChatMessage } from "@prisma/client";
import { HotelDetailsDto } from "@/lib/validation/hotels/hotels.schema.js";

export type ConciergeContextInput = {
    booking: Booking;
    hotel: HotelDetailsDto | null;
};

export type SystemInstructionInput = {
    context: string;
    nonce: string;
};

export type ConciergeTurnsInput = {
    history: ChatMessage[];
    question: string;
};

export type RemainingTodayInput = {
    limit: number;
    used: number;
    globalLimit: number;
    globalUsed: number;
};

export type CountLabelInput = {
    count: number;
    singular: string;
    plural: string;
};
