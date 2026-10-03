export type Geometry = {
  page: "a4" | "letter" | "legal";
  orientation?: "portrait" | "landscape";
  fit?: "contain" | "cover";
};

export type BundleDocument =
  | { mimeType: "text/html"; data: string | Uint8Array; geometry?: Omit<Geometry, "fit"> }
  | { mimeType: "image/png" | "image/jpeg"; data: Uint8Array; geometry?: Geometry }
  | { mimeType: "application/pdf"; data: Uint8Array; geometry?: Geometry };

/** Convert and concatenate documents, preserving input page order. Browser API. */
export declare function merge(documents: readonly BundleDocument[]): Promise<Uint8Array>;
