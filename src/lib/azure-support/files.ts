// Attachment rules from Files - Create (2024-04-01): a file is at most 5 MB,
// split into at most 2 chunks of at most 2.5 MB, each uploaded base64-encoded.
// Decimal megabytes are used so the limits hold whichever MB the service means.

export const MAX_FILE_BYTES = 5_000_000;
export const MAX_CHUNK_BYTES = 2_500_000;
export const MAX_CHUNKS = 2;

export interface ChunkPlan {
  fileSize: number;
  chunkSize: number;
  numberOfChunks: number;
}

export function planChunks(fileSize: number): ChunkPlan {
  if (!Number.isInteger(fileSize) || fileSize <= 0) throw new RangeError("The file is empty.");
  if (fileSize > MAX_FILE_BYTES) {
    throw new RangeError(`The file is ${formatBytes(fileSize)}; Azure Support accepts at most ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  const numberOfChunks = Math.ceil(fileSize / MAX_CHUNK_BYTES);
  return { fileSize, chunkSize: Math.min(fileSize, MAX_CHUNK_BYTES), numberOfChunks };
}

/** Byte ranges [start, end) for each chunk, in upload order. */
export function chunkRanges(plan: ChunkPlan): Array<[number, number]> {
  return Array.from({ length: plan.numberOfChunks }, (_, i) => [
    i * plan.chunkSize,
    Math.min((i + 1) * plan.chunkSize, plan.fileSize),
  ]);
}

/**
 * File names become ARM path segments: keep letters, digits, '-', '_', '.'
 * and spaces, replace anything else, and cap the length while keeping the extension.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  let clean = base.replace(/[^0-9A-Za-z_\-. ]/g, "_").replace(/^[. ]+/, "").trim();
  if (!clean) clean = "attachment";
  if (clean.length > 100) {
    const dot = clean.lastIndexOf(".");
    const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
    clean = clean.slice(0, 100 - ext.length) + ext;
  }
  return clean;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}
