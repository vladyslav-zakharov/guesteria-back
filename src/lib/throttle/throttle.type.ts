export type ThrottleOptions = {
    limit: number;
    windowMs: number;
    maxWaitMs: number;
};

export type Throttle = {
    acquire: () => Promise<boolean>;
};
