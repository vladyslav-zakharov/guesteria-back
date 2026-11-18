import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import { hashing } from "@/lib/hashing/hashing.js";
import { createService } from "@/modules/auth/auth.service.js";
import { UserRepository } from "@/database/repositories/user/user.repository.js";

const user = {
    id: "8d0e7f8e-1f7a-4a39-9a8e-2f1d6b0f3c11",
    email: "a@b.co",
    firstName: "A",
    lastName: "B",
};

describe("authService.signIn", () => {
    it("returns the same error for unknown email and wrong password", async () => {
        const repo = mock<UserRepository>();
        const service = createService(repo);
        const passwordHash = await hashing.hashPassword("correct-password");

        repo.findByEmail.mockResolvedValueOnce(null);
        const unknown = await service
            .signIn({ payload: { email: "x@b.co", password: "whatever1" } })
            .catch((error: unknown) => error);

        repo.findByEmail.mockResolvedValueOnce({
            ...user,
            passwordHash,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const wrong = await service
            .signIn({
                payload: { email: "a@b.co", password: "wrong-password" },
            })
            .catch((error: unknown) => error);

        expect(unknown).toMatchObject({
            statusCode: 401,
            message: "Invalid email or password",
        });
        expect(wrong).toMatchObject({
            statusCode: 401,
            message: "Invalid email or password",
        });
    });

    it("rejects sign-up with a taken email with 409", async () => {
        const repo = mock<UserRepository>();
        const service = createService(repo);

        repo.findByEmail.mockResolvedValueOnce({
            ...user,
            passwordHash: "x",
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(
            service.signUp({
                payload: {
                    email: "a@b.co",
                    password: "password1",
                    firstName: "A",
                    lastName: "B",
                },
            })
        ).rejects.toMatchObject({ statusCode: 409 });
    });
});
