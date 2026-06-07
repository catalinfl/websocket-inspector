import { ConnectWebSocket, DisconnectWebSocket, SendWebSocketBinary, SendWebSocketMessage } from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

/**
 * Status information for a WebSocket connection event.
 */
export interface WebSocketStatus {
    connectionId: string;
    isConnected: boolean;
    connectionLabel: string;
    endpoint?: string;
}

/**
 * Callbacks for WebSocket connection operations.
 */
export interface ConnectCallbacks {
    recordError: (message: string) => void;
    setConnectionStatus: (connectionId: string, text: string, connected: boolean) => void;
}

/**
 * Callbacks for WebSocket disconnection.
 */
export interface DisconnectCallbacks {
    recordError: (message: string) => void;
    onDisconnected: (status: WebSocketStatus) => void;
}

/**
 * Callbacks for sending messages.
 */
export interface SendCallbacks {
    recordError: (message: string) => void;
}

/**
 * Callbacks for WebSocket event listeners.
 */
export interface WebSocketListenerCallbacks {
    onConnected: (status: WebSocketStatus) => void;
    onDisconnected: (status: WebSocketStatus) => void;
    onMessage: (message: unknown) => void;
}

/**
 * Connects to a WebSocket endpoint.
 * @param connectionId - Unique identifier for the connection
 * @param endpoint - WebSocket URL to connect to
 * @param callbacks - Callbacks for status updates and error reporting
 */
export async function connectToWebSocket(connectionId: string, endpoint: string, callbacks: ConnectCallbacks): Promise<void> {
    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
        callbacks.recordError("Enter a websocket URL");
        callbacks.setConnectionStatus(connectionId, "Disconnected", false);
        return;
    }

    try {
        const message = await ConnectWebSocket(connectionId, trimmedEndpoint);
        callbacks.setConnectionStatus(connectionId, message, true);
    } catch (error: unknown) {
        callbacks.setConnectionStatus(connectionId, "Disconnected", false);
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

/**
 * Disconnects from a WebSocket endpoint.
 * @param connectionId - Unique identifier for the connection
 * @param callbacks - Callbacks for disconnection handling and error reporting
 */
export async function disconnectWebSocket(connectionId: string, callbacks: DisconnectCallbacks): Promise<void> {
    try {
        await DisconnectWebSocket(connectionId);
        callbacks.onDisconnected({
            connectionId,
            isConnected: false,
            connectionLabel: "Disconnected",
        });
    } catch (error: unknown) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

/**
 * Sends a binary message over a WebSocket connection.
 * @param connectionId - Unique identifier for the connection
 * @param base64Payload - Base64-encoded binary payload
 * @param callbacks - Callbacks for error reporting
 */
export async function sendBinaryMessage(connectionId: string, base64Payload: string, callbacks: SendCallbacks): Promise<void> {
    try {
        await SendWebSocketBinary(connectionId, base64Payload);
    } catch (error: unknown) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

/**
 * Sends a text message over a WebSocket connection.
 * @param connectionId - Unique identifier for the connection
 * @param payload - Text payload to send
 * @param callbacks - Callbacks for error reporting
 */
export async function sendTextMessage(connectionId: string, payload: string, callbacks: SendCallbacks): Promise<void> {
    try {
        await SendWebSocketMessage(connectionId, payload);
    } catch (error: unknown) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

/**
 * Sets up WebSocket event listeners for connection, disconnection, and messages.
 * @param callbacks - Callbacks for each event type
 */
export function setupWebSocketListeners(callbacks: WebSocketListenerCallbacks): void {
    EventsOn("websocket:connected", (payload: unknown) => {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const p = payload as Record<string, unknown>;
        const status: WebSocketStatus = {
            connectionId: String(p.id),
            isConnected: true,
            connectionLabel: `Connected to ${String(p.endpoint)}`,
            endpoint: String(p.endpoint),
        };
        callbacks.onConnected(status);
    });

    EventsOn("websocket:disconnected", (payload: unknown) => {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const p = payload as Record<string, unknown>;
        const status: WebSocketStatus = {
            connectionId: String(p.id),
            isConnected: false,
            connectionLabel: "Disconnected",
            endpoint: String(p.endpoint),
        };
        callbacks.onDisconnected(status);
    });

    EventsOn("websocket:message", (message: unknown) => {
        callbacks.onMessage(message);
    });
}