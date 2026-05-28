import { ConnectWebSocket, DisconnectWebSocket, SendWebSocketBinary, SendWebSocketMessage } from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";

export async function connectToWebSocket(connectionId, endpoint, callbacks) {
    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
        callbacks.recordError("Enter a websocket URL");
        callbacks.setConnectionStatus(connectionId, "Disconnected", false);
        return;
    }

    try {
        const message = await ConnectWebSocket(connectionId, trimmedEndpoint);
        callbacks.setConnectionStatus(connectionId, message, true);
    } catch (error) {
        callbacks.setConnectionStatus(connectionId, "Disconnected", false);
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

export async function disconnectWebSocket(connectionId, callbacks) {
    try {
        await DisconnectWebSocket(connectionId);
        callbacks.onDisconnected({
            connectionId,
            isConnected: false,
            connectionLabel: "Disconnected",
        });
    } catch (error) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

export async function sendBinaryMessage(connectionId, base64Payload, callbacks) {
    try {
        await SendWebSocketBinary(connectionId, base64Payload);
    } catch (error) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

export async function sendTextMessage(connectionId, payload, callbacks) {
    try {
        await SendWebSocketMessage(connectionId, payload);
    } catch (error) {
        callbacks.recordError(error instanceof Error ? error.message : String(error));
    }
}

export function setupWebSocketListeners(callbacks) {
    EventsOn("websocket:connected", (payload) => {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const status = {
            connectionId: payload.id,
            isConnected: true,
            connectionLabel: `Connected to ${payload.endpoint}`,
            endpoint: payload.endpoint,
        };
        callbacks.onConnected(status);
    });

    EventsOn("websocket:disconnected", (payload) => {
        if (!payload || typeof payload !== "object") {
            return;
        }

        const status = {
            connectionId: payload.id,
            isConnected: false,
            connectionLabel: "Disconnected",
            endpoint: payload.endpoint,
        };
        callbacks.onDisconnected(status);
    });

    EventsOn("websocket:message", (message) => {
        callbacks.onMessage(message);
    });
}
