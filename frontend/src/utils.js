export function formatSizeComparison(jsonBytes, protoBytes) {
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

export function updateSizeComparison(target, jsonBytes, protoBytes) {
    if (!target) {
        return;
    }

    target.textContent = formatSizeComparison(jsonBytes, protoBytes);
}

export function getUtf8ByteLength(text) {
    if (!text) {
        return 0;
    }

    return new TextEncoder().encode(text).length;
}

export function bytesToBase64(bytes) {
    if (!bytes || bytes.length === 0) {
        return "";
    }

    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
}

export function base64ToBytes(value) {
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

export function bytesToHexString(bytes) {
    if (!bytes || bytes.length === 0) {
        return "";
    }

    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    return hex;
}

function normalizeByteCount(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
        return 0;
    }

    return Math.round(numberValue);
}