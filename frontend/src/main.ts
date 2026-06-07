import { onEditorChange, getEditorText, parseJsonEditorValue } from "./editor";
import { createErrorManager } from "./errors";
import { getSchemaStatus, selectOneof, parseSchemaForConnection } from "./schema";
import { sendMessage, handleBinaryResponse, toggleHexView } from "./message";
import { connectToWebSocket, disconnectWebSocket, sendTextMessage, setupWebSocketListeners } from "./websocket";
import { getUtf8ByteLength } from "./utils";
import {
    elements,
    initializeUI,
    setConnectionStatus,
    setErrorStatus,
    setPayloadModeUI,
    updateMessageTypeSelect,
    updateRTTDisplay,
    updateTimestampDisplay,
    updateSizeDisplay,
    updateResponseView,
    setRawHexButtonActive,
    setJsonEditorValue,
    setSchemaValidationStatus,
    setupFileImports,
    setupAdvancedToggle,
    updateConnectButtonState,
} from "./ui";
import {
    createConnectionState,
    getActiveConnection,
    getConnection,
    renderConnections,
    setActiveConnection,
    syncUIFromConnection,
    isSyncing,
    addConnectionState,
    type ConnectionState,
} from "./connections";

initializeUI();

let activeErrorMessage = "";

const { recordError, recordConnectionError } = createErrorManager({
    errorsToggle: elements.errorsToggle,
    errorsPanel: elements.errorsPanel,
    errorsList: elements.errorsList,
    errorToast: elements.errorToast,
    errorToastMessage: elements.errorToastMessage,
    setActiveErrorMessage: (message: string) => {
        activeErrorMessage = String(message);
    },
    refreshStatus: () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }

        setConnectionStatus(connection.connectionLabel, connection.connected);
        if (!connection.connected && activeErrorMessage) {
            setErrorStatus(activeErrorMessage, true);
        } else {
            setErrorStatus("", false);
        }
    },
});

function updateMessageTypeSelectForConnection(
    connection: ConnectionState | null,
    options: import("./parse").OneofOption[],
    selectedValue: string
): string {
    if (!connection || connection.payloadMode !== "proto") {
        return updateMessageTypeSelect([], "");
    }

    return updateMessageTypeSelect(options, selectedValue);
}

if (elements.newConnectionButton) {
    elements.newConnectionButton.addEventListener("click", () => {
        const base = getActiveConnection();
        const endpoint = base?.endpoint || elements.websocketInput?.value || "";
        const protoText = base?.protoText || getEditorText("protoEditor");
        const jsonText = base?.jsonText || getEditorText("jsonEditor");
        const oneofValue = base?.activeOneofValue || "";
        const payloadMode = base?.payloadMode || elements.payloadModeSelect?.value || "json";

        const connection = createConnectionState({ endpoint, protoText, jsonText, oneofValue, payloadMode });
        addConnectionState(connection);

        const schemaCallbacks: import("./schema").ConnectionSchemaCallbacks = {
            recordConnectionError: (connId: string, msg: string) => recordConnectionError(connId, msg, connection, { recordError }),
            updateMessageTypeSelect: (options: import("./parse").OneofOption[], selectedValue: string) => updateMessageTypeSelectForConnection(connection, options, selectedValue),
            selectOneof,
            setJsonEditorValue,
        };

        if (connection.protoText) {
            parseSchemaForConnection(connection, { applyTemplate: false, preferOneofValue: oneofValue }, schemaCallbacks);
        }

        setActiveConnection(connection.id, elements);
        syncUIFromConnection(connection, elements);
    });
}

if (elements.payloadModeSelect) {
    elements.payloadModeSelect.addEventListener("change", () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }

        connection.payloadMode = elements.payloadModeSelect!.value || "json";
        setPayloadModeUI(connection.payloadMode);
        syncUIFromConnection(connection, elements);
    });
}

onEditorChange("protoEditor", (text: string) => {
    if (isSyncing()) {
        return;
    }

    const connection = getActiveConnection();
    if (!connection) {
        return;
    }

    connection.protoText = text;
});

onEditorChange("jsonEditor", (text: string) => {
    if (isSyncing()) {
        return;
    }

    const connection = getActiveConnection();
    if (!connection) {
        return;
    }

    connection.jsonText = text;
});

if (elements.parseSchemaButton) {
    elements.parseSchemaButton.addEventListener("click", () => {
        const connection = getActiveConnection();
        if (!connection) {
            recordError("No active connection");
            return;
        }

        connection.protoText = getEditorText("protoEditor");
        const schemaCallbacks: import("./schema").ConnectionSchemaCallbacks = {
            recordConnectionError: (connId: string, msg: string) => recordConnectionError(connId, msg, connection, { recordError }),
            updateMessageTypeSelect: (options: import("./parse").OneofOption[], selectedValue: string) => updateMessageTypeSelectForConnection(connection, options, selectedValue),
            selectOneof,
            setJsonEditorValue,
        };
        const parsed = parseSchemaForConnection(connection, { applyTemplate: true }, schemaCallbacks);
        setSchemaValidationStatus(parsed ? "valid" : "invalid");
    });
}

if (elements.messageTypeSelect) {
    elements.messageTypeSelect.addEventListener("change", () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }

        if (connection.payloadMode !== "proto") {
            return;
        }

        const value = elements.messageTypeSelect!.value;
        const template = selectOneof(value, connection.schemaState);
        connection.activeOneofValue = value;
        if (template) {
            setJsonEditorValue(template);
        }
    });
}

setupWebSocketListeners({
    onConnected: (status) => {
        const connection = getConnection(status.connectionId);
        if (!connection) {
            return;
        }

        connection.connected = status.isConnected;
        connection.connectionLabel = status.connectionLabel;
        connection.endpoint = status.endpoint || connection.endpoint;
        connection.lastError = "";

        connection.reconnectAttempt = 0;
        connection.manualDisconnect = false;
        if (connection.reconnectTimer) {
            clearTimeout(connection.reconnectTimer);
            connection.reconnectTimer = null;
        }

        if (connection.id === getActiveConnection()?.id) {
            activeErrorMessage = "";
            setErrorStatus("", false);
            setConnectionStatus(status.connectionLabel, true);
            updateConnectButtonState(true);
        }

        renderConnections(elements);
    },
    onDisconnected: (status) => {
        const connection = getConnection(status.connectionId);
        if (!connection) {
            return;
        }

        connection.connected = false;
        connection.connectionLabel = "Disconnected";

        if (connection.id === getActiveConnection()?.id) {
            setConnectionStatus("Disconnected", false);
            updateConnectButtonState(false);
        }

        renderConnections(elements);

        if (connection.manualDisconnect) {
            connection.manualDisconnect = false;
        } else if (connection.autoReconnect && connection.endpoint) {
            scheduleReconnect(connection);
        }
    },
    onMessage: (message: unknown) => {
        if (!message || typeof message !== "object" || !(message as Record<string, unknown>).type) {
            return;
        }

        const msg = message as Record<string, unknown>;
        const connection = getConnection(String(msg.id));
        if (!connection) {
            return;
        }

        if (msg.type === "text") {
            const text = String(msg.data || "");
            if (connection.payloadMode === "json") {
                try {
                    const parsed = JSON.parse(text);
                    connection.responseText = JSON.stringify(parsed, null, 2);
                } catch (_error: unknown) {
                    connection.responseText = text;
                }
            } else {
                connection.responseText = text;
            }
            if (connection.id === getActiveConnection()?.id) {
                updateResponseView(connection.responseText);
            }
            return;
        }

        if (msg.type === "binary") {
            const { protoRoot, activeMessageName } = getSchemaStatus(connection.schemaState);
            handleBinaryResponse(String(msg.data), protoRoot, activeMessageName, connection.messageState, {
                recordError: (errorMsg: string) => recordConnectionError(connection.id, errorMsg, connection, { recordError }),
                onRTTUpdate: (rtt: number, timestamp: string) => {
                    connection.stats.rtt = rtt;
                    connection.stats.timestamp = timestamp;
                    if (connection.id === getActiveConnection()?.id) {
                        updateRTTDisplay(rtt);
                        updateTimestampDisplay(timestamp);
                    }
                },
                onResponseDecoded: (jsonText: string, jsonBytes: number, protoBytes: number) => {
                    connection.responseText = jsonText;
                    connection.stats.jsonBytes = jsonBytes;
                    connection.stats.protoBytes = protoBytes;
                    if (connection.id === getActiveConnection()?.id) {
                        updateResponseView(jsonText);
                        updateSizeDisplay(jsonBytes, protoBytes);
                    }
                },
                onResponseRaw: (text: string) => {
                    connection.responseText = text;
                    if (connection.id === getActiveConnection()?.id) {
                        updateResponseView(text);
                    }
                },
            });
        }
    },
});

if (elements.connectButton && elements.websocketInput) {
    elements.connectButton.addEventListener("click", async () => {
        const connection = getActiveConnection();
        if (!connection) {
            recordError("No active connection");
            return;
        }

        if (connection.connected) {
            connection.manualDisconnect = true;
            clearReconnect(connection);
            await disconnectWebSocket(connection.id, {
                recordError: (message: string) => recordConnectionError(connection.id, message, connection, { recordError }),
                onDisconnected: () => {
                    connection.connected = false;
                    connection.connectionLabel = "Disconnected";
                    updateConnectButtonState(false);
                    setConnectionStatus("Disconnected", false);
                    setErrorStatus("", false);
                    renderConnections(elements);
                },
            });
            return;
        }

        let endpoint: string | null = null;
        if (elements.websocketInput) {
            endpoint = elements.websocketInput.value.trim();
        }

        if (!endpoint) {
            recordConnectionError(connection.id, "Enter a websocket URL", connection, { recordError });
            setConnectionStatus("Disconnected", false);
            return;
        }

        connection.endpoint = endpoint;

        await connectToWebSocket(connection.id, endpoint, {
            recordError: (message: string) => recordConnectionError(connection.id, message, connection, { recordError }),
            setConnectionStatus: (connectionId: string, text: string, connected: boolean) => {
                const target = getConnection(connectionId);
                if (!target) {
                    return;
                }

                target.connected = connected;
                target.connectionLabel = connected ? text : "Disconnected";

                if (connectionId === getActiveConnection()?.id) {
                    setConnectionStatus(text, connected);
                    updateConnectButtonState(connected);
                    if (!connected && activeErrorMessage) {
                        setErrorStatus(activeErrorMessage, true);
                    }
                }

                renderConnections(elements);
            },
        });
    });

    elements.websocketInput!.addEventListener("input", () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }

        connection.endpoint = elements.websocketInput!.value;
        renderConnections(elements);
    });

    elements.websocketInput!.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
            elements.connectButton!.click();
        }
    });
}

const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_DELAY_MS = 3000;

function scheduleReconnect(connection: ConnectionState): void {
    if (!connection.autoReconnect || connection.connected) {
        clearReconnect(connection);
        return;
    }

    if (connection.reconnectTimer) {
        return;
    }

    connection.reconnectAttempt++;
    if (connection.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
        clearReconnect(connection);
        recordConnectionError(connection.id, `Auto-reconnect stopped after ${MAX_RECONNECT_ATTEMPTS} attempts`, connection, { recordError });
        return;
    }

    const isActive = connection.id === getActiveConnection()?.id;
    if (isActive && elements.autoReconnectLabel) {
        elements.autoReconnectLabel.classList.add("is-reconnecting");
    }

    connection.reconnectTimer = setTimeout(async () => {
        connection.reconnectTimer = null;
        const current = getConnection(connection.id);
        if (!current || !current.autoReconnect || current.connected || !current.endpoint) {
            if (current) {
                clearReconnect(current);
            }
            return;
        }
        await connectToWebSocket(current.id, current.endpoint, {
            recordError: (message: string) => recordConnectionError(current.id, message, current, { recordError }),
            setConnectionStatus: (connectionId: string, text: string, connected: boolean) => {
                const target = getConnection(connectionId);
                if (!target) {
                    return;
                }

                target.connected = connected;
                target.connectionLabel = connected ? text : "Disconnected";

                if (connectionId === getActiveConnection()?.id) {
                    setConnectionStatus(text, connected);
                    updateConnectButtonState(connected);
                }

                renderConnections(elements);
            },
        });
        const latest = getConnection(connection.id);
        if (latest && !latest.connected && latest.autoReconnect) {
            scheduleReconnect(latest);
        }
    }, RECONNECT_DELAY_MS);
}

function clearReconnect(connection: ConnectionState | null): void {
    if (!connection) {
        return;
    }
    if (connection.reconnectTimer) {
        clearTimeout(connection.reconnectTimer);
        connection.reconnectTimer = null;
    }
    connection.reconnectAttempt = 0;
    const activeConnection = getActiveConnection();
    if (activeConnection && connection.id === activeConnection.id && elements.autoReconnectLabel) {
        elements.autoReconnectLabel.classList.remove("is-reconnecting");
    }
}

// Auto-reconnect checkbox
if (elements.autoReconnectCheckbox) {
    elements.autoReconnectCheckbox.addEventListener("change", () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }
        connection.autoReconnect = elements.autoReconnectCheckbox!.checked;
        if (connection.autoReconnect && !connection.connected && connection.endpoint) {
            scheduleReconnect(connection);
        } else if (!connection.autoReconnect) {
            clearReconnect(connection);
        }
    });
}

if (elements.sendButton) {
    elements.sendButton.addEventListener("click", async () => {
        const connection = getActiveConnection();
        if (!connection) {
            recordError("No active connection");
            return;
        }

        if (!connection.connected) {
            recordConnectionError(connection.id, "WebSocket is not connected", connection, { recordError });
            return;
        }

        const payloadMode = connection.payloadMode || "json";

        if (payloadMode === "proto") {
            const { protoRoot, activeMessageName } = getSchemaStatus(connection.schemaState);

            try {
                const parsed = parseJsonEditorValue();
                const jsonPayload = parsed.value;
                const jsonText = parsed.text;

                if (!jsonPayload) {
                    recordConnectionError(connection.id, "JSON payload is empty", connection, { recordError });
                    return;
                }

                await sendMessage(connection.id, jsonPayload, jsonText, protoRoot, activeMessageName, connection.messageState, {
                    recordError: (message: string) => recordConnectionError(connection.id, message, connection, { recordError }),
                    onSizeUpdate: (jsonBytes: number, protoBytes: number) => {
                        connection.stats.jsonBytes = jsonBytes;
                        connection.stats.protoBytes = protoBytes;
                        if (connection.id === getActiveConnection()?.id) {
                            updateSizeDisplay(jsonBytes, protoBytes);
                        }
                    },
                });
            } catch (error: unknown) {
                recordConnectionError(connection.id, error instanceof Error ? error.message : "Invalid JSON input", connection, { recordError });
            }
            return;
        }

        const rawText = getEditorText("jsonEditor");
        if (!rawText.trim()) {
            recordConnectionError(connection.id, "Payload is empty", connection, { recordError });
            return;
        }

        if (payloadMode === "json") {
            try {
                JSON.parse(rawText);
            } catch (error: unknown) {
                recordConnectionError(connection.id, error instanceof Error ? error.message : "Invalid JSON input", connection, { recordError });
                return;
            }
        }

        connection.stats.jsonBytes = getUtf8ByteLength(rawText);
        connection.stats.protoBytes = 0;
        if (connection.id === getActiveConnection()?.id) {
            updateSizeDisplay(connection.stats.jsonBytes, connection.stats.protoBytes);
        }

        await sendTextMessage(connection.id, rawText, {
            recordError: (message: string) => recordConnectionError(connection.id, message, connection, { recordError }),
        });
    });
}

if (elements.rawHexButton) {
    elements.rawHexButton.addEventListener("click", () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }

        const { protoRoot, activeMessageName } = getSchemaStatus(connection.schemaState);
        const isActive = toggleHexView(protoRoot, activeMessageName, connection.messageState, {
            recordError: (message: string) => recordConnectionError(connection.id, message, connection, { recordError }),
            onViewChanged: (viewType: string, content: string) => {
                connection.responseText = content;
                if (connection.id === getActiveConnection()?.id) {
                    updateResponseView(content);
                    setRawHexButtonActive(isActive);
                }
            },
        });
    });
}

setupFileImports();
setupAdvancedToggle();

// Initialize with first connection
const initialConnection = createConnectionState();
addConnectionState(initialConnection);
setActiveConnection(initialConnection.id, elements);