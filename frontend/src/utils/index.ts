/**
 * Formats a byte size comparison between JSON and protobuf payloads.
 * @param jsonBytes - Number of bytes in the JSON payload
 * @param protoBytes - Number of bytes in the protobuf payload
 * @returns A human-readable comparison string
 */
export function formatSizeComparison(jsonBytes: number, protoBytes: number): string {
    const normalizedJsonBytes = normalizeByteCount(jsonBytes);
    const normalizedProtoBytes = normalizeByteCount(protoBytes);

    const differenceBytes = Math.abs(normalizedJsonBytes - normalizedProtoBytes);

    if (normalizedJsonBytes === normalizedProtoBytes) {
        return `JSON size: ${normalizedJsonBytes}B - Proto size: ${normalizedProtoBytes}B (same size)`;
    }

    const percentDelta = normalizedJsonBytes === 0
        ? 0
        : Math.round((differenceBytes / normalizedJsonBytes) * 100);

    const sizeLabel = normalizedJsonBytes > normalizedProtoBytes ? "smaller" : "larger";
    return `JSON size: ${normalizedJsonBytes}B - Proto size: ${normalizedProtoBytes}B (${differenceBytes}B difference, ${percentDelta}% ${sizeLabel})`;
}

/**
 * Updates a DOM element's text content with a formatted size comparison.
 * @param target - The HTML element to update
 * @param jsonBytes - Number of bytes in the JSON payload
 * @param protoBytes - Number of bytes in the protobuf payload
 */
export function updateSizeComparison(target: HTMLElement | null, jsonBytes: number, protoBytes: number): void {
    if (!target) {
        return;
    }

    target.textContent = formatSizeComparison(jsonBytes, protoBytes);
}

/**
 * Returns the UTF-8 byte length of a string.
 * @param text - The input string
 * @returns The byte length in UTF-8 encoding
 */
export function getUtf8ByteLength(text: string): number {
    if (!text) {
        return 0;
    }

    return new TextEncoder().encode(text).length;
}

/**
 * Converts a byte array to a base64-encoded string.
 * @param bytes - The byte array to encode
 * @returns Base64-encoded string
 */
export function bytesToBase64(bytes: Uint8Array): string {
    if (!bytes || bytes.length === 0) {
        return "";
    }

    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
}

/**
 * Converts a base64-encoded string to a byte array.
 * @param value - Base64-encoded string
 * @returns Decoded byte array
 */
export function base64ToBytes(value: string): Uint8Array {
    if (!value) {
        return new Uint8Array();
    }

    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

/**
 * Converts a byte array to a hex string with spaces between bytes.
 * @param bytes - The byte array to convert
 * @returns Hex string (e.g. "48 65 6c 6c 6f")
 */
export function bytesToHexString(bytes: Uint8Array): string {
    if (!bytes || bytes.length === 0) {
        return "";
    }

    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    return hex;
}

/**
 * Normalizes a byte count to a non-negative integer.
 * @param value - Raw byte count value
 * @returns Normalized non-negative integer
 */
function normalizeByteCount(value: number): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
        return 0;
    }

    return Math.round(numberValue);
}