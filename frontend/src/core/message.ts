import { verifyMessagePayload, encodeMessagePayload, decodeMessagePayload } from "./protobuf";
import { getUtf8ByteLength, bytesToBase64, base64ToBytes, bytesToHexString } from "../utils";
import { sendBinaryMessage } from "../services/websocket";
import type { Root } from "protobufjs";

/**
 * Represents the state of message sending/receiving for a connection.
 */
export interface MessageState {
    lastSendTimestamp: number;
    lastResponseBytes: Uint8Array | null;
    isHexViewActive: boolean;
}

/**
 * Callbacks for message sending operations.
 */
export interface SendMessageCallbacks {
    recordError: (message: string) => void;
    onSizeUpdate?: (jsonBytes: number, protoBytes: number) => void;
}

/**
 * Callbacks for binary response handling.
 */
export interface BinaryResponseCallbacks {
    recordError: (message: string) => void;
    onRTTUpdate: (rtt: number, timestamp: string) => void;
    onResponseDecoded: (jsonText: string, jsonBytes: number, protoBytes: number) => void;
    onResponseRaw: (text: string) => void;
}

/**
 * Callbacks for hex view toggling.
 */
export interface HexViewCallbacks {
    recordError: (message: string) => void;
    onViewChanged: (viewType: string, content: string) => void;
}

/**
 * Creates a new message state.
 * @returns A fresh MessageState
 */
export function createMessageState(): MessageState {
    return {
        lastSendTimestamp: 0,
        lastResponseBytes: null,
        isHexViewActive: false,
    };
}

/**
 * Sends a protobuf-encoded message over a WebSocket connection.
 * @param connectionId - The connection ID
 * @param jsonPayload - The parsed JSON payload
 * @param jsonText - The raw JSON text
 * @param protoRoot - The protobuf root
 * @param activeMessageName - The active message type name
 * @param messageState - The message state to update
 * @param callbacks - Callbacks for error reporting and size updates
 */
export async function sendMessage(
    connectionId: string,
    jsonPayload: Record<string, unknown>,
    jsonText: string,
    protoRoot: Root | null,
    activeMessageName: string,
    messageState: MessageState,
    callbacks: SendMessageCallbacks
): Promise<void> {
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
        callbacks.onSizeUpdate?.(jsonBytes, protoBytes.length);
        messageState.lastSendTimestamp = Date.now();
        await sendBinaryMessage(connectionId, bytesToBase64(protoBytes), callbacks);
    } catch (error: unknown) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

/**
 * Handles a binary response from a WebSocket connection.
 * @param base64Data - The base64-encoded binary data
 * @param protoRoot - The protobuf root (may be null if schema not parsed)
 * @param activeMessageName - The active message type name
 * @param messageState - The message state to update
 * @param callbacks - Callbacks for RTT, decoded response, and errors
 */
export function handleBinaryResponse(
    base64Data: string,
    protoRoot: Root | null,
    activeMessageName: string,
    messageState: MessageState,
    callbacks: BinaryResponseCallbacks
): void {
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
            } catch (decodeError: unknown) {
                callbacks.recordError("Failed to decode payload: " + (decodeError instanceof Error ? decodeError.message : String(decodeError)));
                callbacks.onResponseRaw("Binary data received but could not decode");
            }
        } else {
            callbacks.recordError("Proto schema is not ready to decode incoming data");
            callbacks.onResponseRaw("Binary data received but schema not ready");
        }
    } catch (error: unknown) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

/**
 * Calculates the round-trip time (RTT) from the last send timestamp.
 * @param messageState - The message state with send timestamp
 * @returns An object with rtt and timestamp, or null if no send has occurred
 */
export function calculateRTT(messageState: MessageState): { rtt: number; timestamp: string } | null {
    if (!messageState || messageState.lastSendTimestamp <= 0) {
        return null;
    }

    const rtt = Date.now() - messageState.lastSendTimestamp;
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', { hour12: false });
    messageState.lastSendTimestamp = 0;
    return { rtt, timestamp };
}

/**
 * Toggles between hex and JSON view of the last response data.
 * @param protoRoot - The protobuf root (may be null)
 * @param activeMessageName - The active message type name
 * @param messageState - The message state with response bytes
 * @param callbacks - Callbacks for view changes and errors
 * @returns True if hex view is now active, false otherwise
 */
export function toggleHexView(
    protoRoot: Root | null,
    activeMessageName: string,
    messageState: MessageState,
    callbacks: HexViewCallbacks
): boolean {
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
            } catch (error: unknown) {
                callbacks.recordError(error instanceof Error ? error.message : String(error));
            }
        }
    }

    return messageState.isHexViewActive;
}