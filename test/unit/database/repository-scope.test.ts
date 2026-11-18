import { describe, expectTypeOf, it } from "vitest";
import { BookingRepository } from "@/database/repositories/booking/booking.repository.js";
import { PrebookRepository } from "@/database/repositories/prebook/prebook.repository.js";
import { ChatMessageRepository } from "@/database/repositories/chat-message/chat-message.repository.js";

describe("owner-scoped repositories", () => {
    it("expose no id-only loaders", () => {
        expectTypeOf<BookingRepository>().not.toHaveProperty("findUnique");
        expectTypeOf<BookingRepository>().not.toHaveProperty("findFirst");
        expectTypeOf<BookingRepository>().not.toHaveProperty("findMany");
        expectTypeOf<PrebookRepository>().not.toHaveProperty("findUnique");
        expectTypeOf<PrebookRepository>().not.toHaveProperty("update");
        expectTypeOf<ChatMessageRepository>().not.toHaveProperty("findMany");
    });
});
