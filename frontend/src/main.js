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
} from "./connections";

initializeUI();

let activeErrorMessage = "";

const { recordError, recordConnectionError } = createErrorManager({
    errorsToggle: elements.errorsToggle,
    errorsPanel: elements.errorsPanel,
    errorsList: elements.errorsList,
    errorToast: elements.errorToast,
    errorToastMessage: elements.errorToastMessage,
    setActiveErrorMessage: (message) => {
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

function updateMessageTypeSelectForConnection(connection, options, selectedValue) {
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

        const schemaCallbacks = {
            recordConnectionError: (connId, msg) => recordConnectionError(connId, msg, connection, { recordError }),
            updateMessageTypeSelect: (options, selectedValue) => updateMessageTypeSelectForConnection(connection, options, selectedValue),
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

        connection.payloadMode = elements.payloadModeSelect.value || "json";
        setPayloadModeUI(connection.payloadMode);
        syncUIFromConnection(connection, elements);
    });
}

onEditorChange("protoEditor", (text) => {
    if (isSyncing()) {
        return;
    }

    const connection = getActiveConnection();
    if (!connection) {
        return;
    }

    connection.protoText = text;
});

onEditorChange("jsonEditor", (text) => {
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
        const schemaCallbacks = {
            recordConnectionError: (connId, msg) => recordConnectionError(connId, msg, connection, { recordError }),
            updateMessageTypeSelect: (options, selectedValue) => updateMessageTypeSelectForConnection(connection, options, selectedValue),
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

        const value = elements.messageTypeSelect.value;
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
    },
    onMessage: (message) => {
        if (!message || typeof message !== "object" || !message.type) {
            return;
        }

        const connection = getConnection(message.id);
        if (!connection) {
            return;
        }

        if (message.type === "text") {
            const text = String(message.data || "");
            if (connection.payloadMode === "json") {
                try {
                    const parsed = JSON.parse(text);
                    connection.responseText = JSON.stringify(parsed, null, 2);
                } catch (error) {
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

        if (message.type === "binary") {
            const { protoRoot, activeMessageName } = getSchemaStatus(connection.schemaState);
            handleBinaryResponse(message.data, protoRoot, activeMessageName, connection.messageState, {
                recordError: (msg) => recordConnectionError(connection.id, msg, connection, { recordError }),
                onRTTUpdate: (rtt, timestamp) => {
                    connection.stats.rtt = rtt;
                    connection.stats.timestamp = timestamp;
                    if (connection.id === getActiveConnection()?.id) {
                        updateRTTDisplay(rtt);
                        updateTimestampDisplay(timestamp);
                    }
                },
                onResponseDecoded: (jsonText, jsonBytes, protoBytes) => {
                    connection.responseText = jsonText;
                    connection.stats.jsonBytes = jsonBytes;
                    connection.stats.protoBytes = protoBytes;
                    if (connection.id === getActiveConnection()?.id) {
                        updateResponseView(jsonText);
                        updateSizeDisplay(jsonBytes, protoBytes);
                    }
                },
                onResponseRaw: (text) => {
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
            await disconnectWebSocket(connection.id, {
                recordError: (message) => recordConnectionError(connection.id, message, connection, { recordError }),
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

        const endpoint = elements.websocketInput.value.trim();

        if (!endpoint) {
            recordConnectionError(connection.id, "Enter a websocket URL", connection, { recordError });
            setConnectionStatus("Disconnected", false);
            return;
        }

        connection.endpoint = endpoint;

        await connectToWebSocket(connection.id, endpoint, {
            recordError: (message) => recordConnectionError(connection.id, message, connection, { recordError }),
            setConnectionStatus: (connectionId, text, connected) => {
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

    elements.websocketInput.addEventListener("input", () => {
        const connection = getActiveConnection();
        if (!connection) {
            return;
        }

        connection.endpoint = elements.websocketInput.value;
        renderConnections(elements);
    });

    elements.websocketInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            elements.connectButton.click();
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
                    recordError: (message) => recordConnectionError(connection.id, message, connection, { recordError }),
                    onSizeUpdate: (jsonBytes, protoBytes) => {
                        connection.stats.jsonBytes = jsonBytes;
                        connection.stats.protoBytes = protoBytes;
                        if (connection.id === getActiveConnection()?.id) {
                            updateSizeDisplay(jsonBytes, protoBytes);
                        }
                    },
                });
            } catch (error) {
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
            } catch (error) {
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
            recordError: (message) => recordConnectionError(connection.id, message, connection, { recordError }),
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
            recordError: (message) => recordConnectionError(connection.id, message, connection, { recordError }),
            onViewChanged: (viewType, content) => {
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
