import fs from "node:fs";
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const testEnv = parseEnv(
    fs.readFileSync(path.join(process.cwd(), ".env.test"), "utf-8")
);

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        env: {
            ...testEnv,
            NODE_OPTIONS: "--import tsx",
        },
        server: {
            deps: {
                inline: ["@fastify/autoload"],
            },
        },
    },
});
