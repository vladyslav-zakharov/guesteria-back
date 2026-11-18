import { NotFoundError } from "@/lib/errors/errors.js";
import { addDIResolverName } from "@/lib/awilix/awilix.js";
import { Prisma, PrismaClient, User } from "@prisma/client";
import { generateRepository } from "../generate.repository.js";
import { FindUniqueOrFail } from "@/database/prisma/prisma.type.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { BaseRepository } from "@/database/repositories/repository.type.js";

export type UserRepository = BaseRepository<"user"> & {
    findUniqueOrFail: FindUniqueOrFail<
        Prisma.UserFindUniqueArgs,
        Prisma.$UserPayload
    >;
    findByEmail: (email: string) => Promise<User | null>;
};

export const createUserRepository = (prisma: PrismaClient): UserRepository => {
    const repository = generateRepository(prisma, "User");

    return {
        ...repository,
        findUniqueOrFail: async (args) => {
            const user = await prisma.user.findUnique(args);

            if (!user) {
                throw new NotFoundError(RESPONSE_MESSAGES.user.notFound);
            }

            return user;
        },

        findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
    };
};

addDIResolverName(createUserRepository, "userRepository");
