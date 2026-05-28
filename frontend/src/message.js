import { verifyMessagePayload, encodeMessagePayload, decodeMessagePayload } from "./protobuf";
import { getUtf8ByteLength, bytesToBase64, base64ToBytes, bytesToHexString } from "./utils";
import { sendBinaryMessage } from "./websocket";

export function createMessageState() {
    return {
        lastSendTimestamp: 0,
        lastResponseBytes: null,
        isHexViewActive: false,
    };
}

export async function sendMessage(connectionId, jsonPayload, jsonText, protoRoot, activeMessageName, messageState, callbacks) {
    if (!protoRoot || !activeMessageName) {
        callbacks.recordError("Parse the schema and select a oneof first");
        return;
    }

    if (!jsonPayload) {
        callbacks.recordError("JSON payload is empty");
        return;
    }

    const verifyError = verifyMessagePayload(protoRoot, activeMessageName, jsonPayload);
    if (verifyError) {
        callbacks.recordError(`Schema validation failed: ${verifyError}`);
        return;
    }

    try {
        const protoBytes = encodeMessagePayload(protoRoot, activeMessageName, jsonPayload);
        const jsonBytes = getUtf8ByteLength(jsonText);
        callbacks.onSizeUpdate(jsonBytes, protoBytes.length);
        messageState.lastSendTimestamp = Date.now();
        await sendBinaryMessage(connectionId, bytesToBase64(protoBytes), callbacks);
    } catch (error) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

export function handleBinaryResponse(base64Data, protoRoot, activeMessageName, messageState, callbacks) {
    try {
        const bytes = base64ToBytes(base64Data);
        messageState.lastResponseBytes = bytes;
        messageState.isHexViewActive = false;

        // Update RTT and timestamp
        const rttInfo = calculateRTT(messageState);
        if (rttInfo) {
            callbacks.onRTTUpdate(rttInfo.rtt, rttInfo.timestamp);
        }

        // Try to decode if schema is ready
        if (protoRoot && activeMessageName) {
            try {
                const decoded = decodeMessagePayload(protoRoot, activeMessageName, bytes);
                const jsonText = JSON.stringify(decoded, null, 2);
                callbacks.onResponseDecoded(jsonText, getUtf8ByteLength(jsonText), bytes.length);
            } catch (decodeError) {
                callbacks.recordError("Failed to decode payload: " + (decodeError instanceof Error ? decodeError.message : String(decodeError)));
                callbacks.onResponseRaw("Binary data received but could not decode");
            }
        } else {
            callbacks.recordError("Proto schema is not ready to decode incoming data");
            callbacks.onResponseRaw("Binary data received but schema not ready");
        }
    } catch (error) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

export function calculateRTT(messageState) {
    if (!messageState || messageState.lastSendTimestamp <= 0) {
        return null;
    }

    const rtt = Date.now() - messageState.lastSendTimestamp;
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false });
    messageState.lastSendTimestamp = 0;
    return { rtt, timestamp };
}

export function toggleHexView(protoRoot, activeMessageName, messageState, callbacks) {
    if (!messageState.lastResponseBytes) {
        callbacks.recordError("No response data available");
        return false;
    }

    messageState.isHexViewActive = !messageState.isHexViewActive;

    if (messageState.isHexViewActive) {
        const hexText = bytesToHexString(messageState.lastResponseBytes);
        callbacks.onViewChanged("hex", hexText);
    } else {
        if (protoRoot && activeMessageName) {
            try {
                const decoded = decodeMessagePayload(protoRoot, activeMessageName, messageState.lastResponseBytes);
                const jsonText = JSON.stringify(decoded, null, 2);
                callbacks.onViewChanged("json", jsonText);
            } catch (error) {
                callbacks.recordError(error instanceof Error ? error.message : String(error));
            }
        }
    }

    return messageState.isHexViewActive;
}
