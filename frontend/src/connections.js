import { createSchemaState, getSchemaStatus } from "./schema";
import { createMessageState } from "./message";
import { getEditorText, setEditorText } from "./editor";
import { setConnectionStatus, updateConnectButtonState, updateMessageTypeSelect, setRawHexButtonActive, setPayloadModeUI, setSchemaValidationStatus } from "./ui";

// Connection state management
let connections = new Map();
let activeConnectionId = "";
let connectionCounter = 1;
let isSyncingEditors = false;
let editingConnectionId = "";

export function createConnectionState({ name, endpoint, protoText, jsonText, oneofValue, payloadMode } = {}) {
    const id = `connection-${connectionCounter}`;
    const connectionName = name || `Connection ${connectionCounter}`;
    connectionCounter += 1;

    return {
        id,
        name: connectionName,
        endpoint: endpoint || "",
        connected: false,
        connectionLabel: "Disconnected",
        payloadMode: payloadMode || "json",
        protoText: protoText || "",
        jsonText: jsonText || "",
        responseText: "",
        schemaState: createSchemaState(),
        messageState: createMessageState(),
        stats: {
            rtt: null,
            timestamp: "",
            jsonBytes: 0,
            protoBytes: 0,
        },
        activeOneofValue: oneofValue || "",
        lastError: "",
    };
}

export function getActiveConnection() {
    return connections.get(activeConnectionId) || null;
}

export function getConnection(connectionId) {
    return connections.get(connectionId) || null;
}

export function getActiveConnectionId() {
    return activeConnectionId;
}

export function getAllConnections() {
    return Array.from(connections.values());
}

export function addConnectionState(connection) {
    connections.set(connection.id, connection);
}

export function renderConnections(elements) {
    if (!elements.connectionsList) {
        return;
    }

    elements.connectionsList.textContent = "";

    for (const connection of connections.values()) {
        const isEditing = editingConnectionId === connection.id;

        const item = document.createElement("div");
        item.className = "connection-item" + (connection.id === activeConnectionId ? " is-active" : "") + (isEditing ? " is-editing" : "");
        item.dataset.connectionId = connection.id;

        const mainButton = document.createElement("button");
        mainButton.type = "button";
        mainButton.className = "connection-main";
        mainButton.dataset.connectionId = connection.id;

        const header = document.createElement("div");
        header.className = "connection-row" + (isEditing ? " is-editing" : "");

        const status = document.createElement("span");
        status.className = "connection-status" + (connection.connected ? " is-connected" : " is-disconnected");
        let nameElement = null;
        if (isEditing) {
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.className = "connection-name-input";
            nameInput.value = connection.name;
            nameInput.setAttribute("aria-label", "Connection name");
            nameInput.dataset.connectionId = connection.id;
            nameElement = nameInput;
        } else {
            const name = document.createElement("span");
            name.className = "connection-name";
            name.textContent = connection.name;
            name.dataset.fullName = connection.name;
            nameElement = name;
        }

        header.appendChild(status);
        header.appendChild(nameElement);

        const actions = document.createElement("div");
        actions.className = "connection-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "icon-btn icon-btn-xs";
        editButton.setAttribute("aria-label", "Edit connection name");
        editButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">edit</span>';

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "icon-btn icon-btn-xs";
        deleteButton.setAttribute("aria-label", "Delete connection");
        deleteButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete</span>';

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);

        const endpoint = document.createElement("div");
        endpoint.className = "connection-endpoint";
        endpoint.textContent = connection.endpoint || "No endpoint";

        mainButton.appendChild(header);
        mainButton.appendChild(endpoint);

        item.appendChild(mainButton);
        item.appendChild(actions);

        mainButton.addEventListener("click", () => setActiveConnectionDirect(connection.id, elements));
        editButton.addEventListener("click", (event) => {
            event.stopPropagation();
            startEditingConnectionName(connection.id, elements);
        });
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteConnection(connection.id, elements);
        });

        if (isEditing && nameElement) {
            const nameInput = nameElement;
            mainButton.disabled = true;
            nameInput.focus();
            nameInput.select();
            nameInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    commitConnectionName(connection.id, nameInput.value, elements);
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditingConnectionName(elements);
                }
            });
            nameInput.addEventListener("blur", () => {
                commitConnectionName(connection.id, nameInput.value, elements);
            });
        } else {
            item.addEventListener("mouseenter", () => {
                const name = item.querySelector(".connection-name");
                if (!name) {
                    return;
                }
                const fullName = name.dataset.fullName || "";
                if (fullName.length > 10) {
                    name.textContent = `${fullName.slice(0, 10)}...`;
                }
            });
            item.addEventListener("mouseleave", () => {
                const name = item.querySelector(".connection-name");
                if (!name) {
                    return;
                }
                name.textContent = name.dataset.fullName || "";
            });
        }

        elements.connectionsList.appendChild(item);
    }
}

function startEditingConnectionName(connectionId, elements) {
    if (!connections.has(connectionId)) {
        return;
    }

    editingConnectionId = connectionId;
    renderConnections(elements);
    requestAnimationFrame(() => {
        const selector = `.connection-name-input[data-connection-id="${connectionId}"]`;
        const input = elements.connectionsList?.querySelector(selector);
        if (input) {
            input.focus();
            input.select();
        }
    });
}

function cancelEditingConnectionName(elements) {
    editingConnectionId = "";
    renderConnections(elements);
}

function commitConnectionName(connectionId, nextName, elements) {
    const connection = connections.get(connectionId);
    if (!connection) {
        return;
    }

    const trimmedName = String(nextName || "").trim();
    if (trimmedName) {
        connection.name = trimmedName;
    }

    editingConnectionId = "";
    renderConnections(elements);
}

function deleteConnection(connectionId, elements) {
    const connection = connections.get(connectionId);
    if (!connection) {
        return;
    }

    const confirmed = window.confirm(`Delete ${connection.name}?`);
    if (!confirmed) {
        return;
    }

    connections.delete(connectionId);

    if (connections.size === 0) {
        const newConnection = createConnectionState();
        connections.set(newConnection.id, newConnection);
        activeConnectionId = newConnection.id;
        syncUIFromConnection(newConnection, elements);
        renderConnections(elements);
        return;
    }

    if (connectionId === activeConnectionId) {
        const [nextConnection] = connections.values();
        if (nextConnection) {
            activeConnectionId = nextConnection.id;
            syncUIFromConnection(nextConnection, elements);
        }
    }

    renderConnections(elements);
}

function setActiveConnectionDirect(connectionId, elements) {
    if (!connections.has(connectionId)) {
        return;
    }

    activeConnectionId = connectionId;
    syncUIFromConnection(getActiveConnection(), elements);
    renderConnections(elements);
}

export function setActiveConnection(connectionId, elements) {
    setActiveConnectionDirect(connectionId, elements);
}

export function syncUIFromConnection(connection, elements) {
    if (!connection) {
        return;
    }

    setSyncing(true);
    setEditorText("protoEditor", connection.protoText);
    setEditorText("jsonEditor", connection.jsonText);
    setEditorText("responseEditor", connection.responseText);
    setSyncing(false);

    if (elements.websocketInput) {
        elements.websocketInput.value = connection.endpoint || "";
    }

    setConnectionStatus(connection.connectionLabel, connection.connected);
    updateConnectButtonState(connection.connected);

    const payloadMode = connection.payloadMode || "json";
    setPayloadModeUI(payloadMode);
    setSchemaValidationStatus(connection.schemaState.validationStatus || "empty");

    const isProto = payloadMode === "proto";
    if (!isProto) {
        updateMessageTypeSelect([], "");
        setRawHexButtonActive(false);
    } else {
        const { oneofOptions } = getSchemaStatus(connection.schemaState);
        const selectedValue = updateMessageTypeSelect(oneofOptions, connection.activeOneofValue);
        connection.activeOneofValue = selectedValue;
    }
}

export function isSyncing() {
    return isSyncingEditors;
}

export function setSyncing(value) {
    isSyncingEditors = value;
}
