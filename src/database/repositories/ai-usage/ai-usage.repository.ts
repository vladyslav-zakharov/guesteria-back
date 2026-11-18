import { PrismaClient } from "@prisma/client";
import { addDIResolverName } from "@/lib/awilix/awilix.js";

type AiUsageWhere = { userId: string; day: Date };

type AiUsageDayWhere = { day: Date };

export type AiUsageRepository = {
    incrementAndGetCount: (where: AiUsageWhere) => Promise<number>;
    getCount: (where: AiUsageWhere) => Promise<number>;
    getTotalCount: (where: AiUsageDayWhere) => Promise<number>;
};

export const createAiUsageRepository = (
    prisma: PrismaClient
): AiUsageRepository => ({
    /**
     * Single upsert on the (userId, day) key, so concurrent requests increment atomically.
     */
    incrementAndGetCount: async ({ userId, day }) => {
        const { count } = await prisma.aiUsage.upsert({
            where: { userId_day: { userId, day } },
            create: { userId, day, count: 1 },
            update: { count: { increment: 1 } },
            select: { count: true },
        });

        return count;
    },

    getCount: async ({ userId, day }) => {
        const usage = await prisma.aiUsage.findUnique({
            where: { userId_day: { userId, day } },
            select: { count: true },
        });

        return usage?.count ?? 0;
    },

    /**
     * Usage across every user for one day, summed in a single query.
     */
    getTotalCount: async ({ day }) => {
        const { _sum } = await prisma.aiUsage.aggregate({
            where: { day },
            _sum: { count: true },
        });

        return _sum.count ?? 0;
    },
});

addDIResolverName(createAiUsageRepository, "aiUsageRepository");
