/** True if the bytes start with the PDF file signature "%PDF-". */
export function looksLikePdf(bytes: Uint8Array) {
  // Some generators write a byte-order mark or whitespace first; allow up to 1 KB of lead-in.
  const limit = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= limit; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  }
  return false;
}

/**
 * Largest PDF a school may upload, in MB. Configurable with MAX_UPLOAD_MB on the server
 * and NEXT_PUBLIC_MAX_UPLOAD_MB for the browser-side check (set both to the same value).
 * Defaults to 250 MB. Uploads stream to storage, so this is a policy limit, not a memory one.
 */
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 250) || 250;
export const MAX_PDF_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
