import { FastifyBaseLogger } from "fastify";
import { EnvConfig } from "@/types/env.type.js";
import { AiService, ConciergeTurn, TimeoutInput } from "./ai.type.js";
import { RESPONSE_MESSAGES } from "@/lib/messages/messages.constant.js";
import { ApiError, Content, GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
    CONCIERGE_MAX_OUTPUT_TOKENS,
    CONCIERGE_TEMPERATURE,
} from "./ai.constant.js";
import {
    BadGatewayError,
    GatewayTimeoutError,
    ServiceUnavailableError,
} from "@/lib/errors/errors.js";

const withTimeout = <T>({ promise, timeoutMs }: TimeoutInput<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new GatewayTimeoutError(RESPONSE_MESSAGES.ai.timeout));
        }, timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error: unknown) => {
                clearTimeout(timer);
                reject(error as Error);
            });
    });

const toContents = (turns: ConciergeTurn[]): Content[] =>
    turns.map(({ role, text }) => ({ role, parts: [{ text }] }));

/**
 * Vertex AI client over ADC. It is built lazily on the first call, so the app
 * boots without `GCP_PROJECT_ID` and only the chat fails (503). Logs carry
 * status codes and `finishReason` only, never the prompt or the guest's text.
 */
export const createAiService = (
    config: EnvConfig,
    log: FastifyBaseLogger
): AiService => {
    let client: GoogleGenAI | undefined;

    const getClient = (): GoogleGenAI => {
        if (!config.GCP_PROJECT_ID) {
            log.error(
                "GCP_PROJECT_ID is not configured; the AI chat is unavailable"
            );

            throw new ServiceUnavailableError(RESPONSE_MESSAGES.chat.disabled);
        }

        client ??= new GoogleGenAI({
            vertexai: true,
            project: config.GCP_PROJECT_ID,
            location: config.AI_LOCATION,
        });

        return client;
    };

    return {
        generateConciergeReply: async ({ systemInstruction, turns }) => {
            const genAi = getClient();
            const controller = new AbortController();

            let response;

            try {
                response = await withTimeout({
                    promise: genAi.models.generateContent({
                        model: config.AI_MODEL,
                        contents: toContents(turns),
                        config: {
                            systemInstruction,
                            maxOutputTokens: CONCIERGE_MAX_OUTPUT_TOKENS,
                            temperature: CONCIERGE_TEMPERATURE,
                            thinkingConfig: {
                                thinkingLevel: ThinkingLevel.LOW,
                            },
                            abortSignal: controller.signal,
                        },
                    }),
                    timeoutMs: config.AI_TIMEOUT_MS,
                });
            } catch (error) {
                if (error instanceof GatewayTimeoutError) {
                    controller.abort();

                    log.error(
                        { timeoutMs: config.AI_TIMEOUT_MS },
                        "Concierge model call timed out"
                    );

                    throw error;
                }

                log.error(
                    {
                        statusCode:
                            error instanceof ApiError ? error.status : null,
                    },
                    "Concierge model call failed"
                );

                throw new BadGatewayError(RESPONSE_MESSAGES.ai.upstream);
            }

            const text = response.text?.trim();

            if (!text) {
                log.error(
                    {
                        finishReason:
                            response.candidates?.[0]?.finishReason ?? null,
                        blockReason:
                            response.promptFeedback?.blockReason ?? null,
                    },
                    "Concierge model returned no text"
                );

                throw new BadGatewayError(RESPONSE_MESSAGES.ai.upstream);
            }

            return text;
        },
    };
};
