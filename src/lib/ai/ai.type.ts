export type ConciergeTurn = { role: "user" | "model"; text: string };

/**
 * The last turn is the guest's question.
 */
export type ConciergeReplyInput = {
    systemInstruction: string;
    turns: ConciergeTurn[];
};

export type AiService = {
    generateConciergeReply: (input: ConciergeReplyInput) => Promise<string>;
};

export type TimeoutInput<T> = {
    promise: Promise<T>;
    timeoutMs: number;
};
