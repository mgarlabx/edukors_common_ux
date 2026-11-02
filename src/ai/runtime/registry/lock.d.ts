/**
 * A cross-process lock: a directory that exists while it is held. `mkdir` is
 * atomic on every supported filesystem. The holder refreshes its timestamp
 * while it works; a lock whose owner process is gone, or that has not been
 * refreshed within `staleMs`, is taken over.
 */
export interface LockOptions {
    timeoutMs?: number;
    staleMs?: number;
    /** The error thrown when the lock cannot be acquired in time. */
    onTimeout?: () => Error;
}
export declare function withLock<T>(dir: string, fn: () => Promise<T>, options?: LockOptions): Promise<T>;
/** Serializes async work within this process, by key. */
export declare class KeyedMutex {
    private readonly tails;
    run<T>(key: string, fn: () => Promise<T>): Promise<T>;
}
