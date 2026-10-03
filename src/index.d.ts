export type BundleDocument =
  | { mimeType: "text/html"; data: string | Uint8Array }
  | { mimeType: "application/pdf" | "image/png" | "image/jpeg"; data: Uint8Array };

/** Convert and concatenate documents, preserving input page order. Browser API. */
export declare function merge(documents: readonly BundleDocument[]): Promise<Uint8Array>;
