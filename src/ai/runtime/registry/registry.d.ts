import { z } from "zod";
/**
 * The shared account registry: non-secret account metadata, read and written
 * by every EDUKORS application on this computer, possibly running different
 * library versions.
 *
 * Versioning: `schemaVersion` is the format the file was last written in;
 * `minReaderVersion` is the oldest library format that can still read it.
 * A library reads a file whose `minReaderVersion` it meets, and writes only
 * a file whose `schemaVersion` it knows, so an older application never
 * rewrites a newer file. Unknown fields are preserved on write.
 */
export declare const REGISTRY_SCHEMA_VERSION = 1;
export declare const AccountRecordSchema: z.ZodObject<{
    id: z.ZodString;
    providerId: z.ZodString;
    label: z.ZodString;
    home: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$loose>;
export type AccountRecord = z.infer<typeof AccountRecordSchema>;
export declare class AccountRegistry {
    readonly file: string;
    private readonly lockDir;
    private readonly mutex;
    constructor(file: string, lockDir: string);
    list(): Promise<AccountRecord[]>;
    get(id: string): Promise<AccountRecord | undefined>;
    /**
     * Reads, changes and writes the registry under the cross-process lock. `change`
     * mutates the draft; whatever it returns is returned.
     */
    update<T>(change: (accounts: AccountRecord[]) => T): Promise<T>;
    private read;
    /** Write to a temporary file, flush, then rename over the original. */
    private write;
}
