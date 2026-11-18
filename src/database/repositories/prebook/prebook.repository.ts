import { NotFoundError } from "@/lib/errors/errors.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { Prebook, Prisma, PrismaClient } from "@prisma/client";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";

type OwnedPrebookWhere = { id: string; userId: string };

/**
 * Owner-scoped on purpose: there is no method that loads a prebook by id alone.
 */
export type PrebookRepository = {
    create: (args: {
        data: Prisma.PrebookUncheckedCreateInput;
    }) => Promise<Prebook>;
    findOwned: (where: OwnedPrebookWhere) => Promise<Prebook>;
    claimUnused: (where: OwnedPrebookWhere) => Promise<boolean>;
    release: (where: OwnedPrebookWhere) => Promise<void>;
};

export const createPrebookRepository = (
    prisma: PrismaClient
): PrebookRepository => ({
    create: (args) => prisma.prebook.create(args),

    findOwned: async ({ id, userId }) => {
        const prebook = await prisma.prebook.findFirst({
            where: { id, userId },
        });

        if (!prebook) {
            throw new NotFoundError(RESPONSE_MESSAGES.prebook.notFound);
        }

        return prebook;
    },

    /**
     * Atomically marks an unused prebook as used. Returns true only for the call that set `usedAt`,
     * so a concurrent or repeated submit gets false.
     */
    claimUnused: async ({ id, userId }) => {
        const { count } = await prisma.prebook.updateMany({
            where: { id, userId, usedAt: null },
            data: { usedAt: new Date() },
        });

        return count === 1;
    },

    release: async ({ id, userId }) => {
        await prisma.prebook.updateMany({
            where: { id, userId },
            data: { usedAt: null },
        });
    },
});

addDIResolverName(createPrebookRepository, "prebookRepository");
