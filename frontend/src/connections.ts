import { createSchemaState, getSchemaStatus, type SchemaState } from "./schema";
import { createMessageState, type MessageState } from "./message";
import { setEditorText } from "./editor";
import { setConnectionStatus, updateConnectButtonState, updateMessageTypeSelect, setRawHexButtonActive, setPayloadModeUI, setSchemaValidationStatus } from "./ui";
import type { UIElements } from "./ui";

/**
 * Represents a single WebSocket connection with all its state.
 */
export interface ConnectionState {
    id: string;
    name: string;
    endpoint: string;
    connected: boolean;
    connectionLabel: string;
    payloadMode: string;
    autoReconnect: boolean;
    protoText: string;
    jsonText: string;
    responseText: string;
    schemaState: SchemaState;
    messageState: MessageState;
    stats: {
        rtt: number | null;
        timestamp: string;
        jsonBytes: number;
        protoBytes: number;
    };
    activeOneofValue: string;
    lastError: string;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    reconnectAttempt: number;
    manualDisconnect: boolean;
}

/**
 * Options for creating a new connection state.
 */
export interface CreateConnectionOptions {
    name?: string;
    endpoint?: string;
    protoText?: string;
    jsonText?: string;
    oneofValue?: string;
    payloadMode?: string;
}

// Connection state management
let connections: Map<string, ConnectionState> = new Map();
let activeConnectionId: string = "";
let connectionCounter: number = 1;
let isSyncingEditors: boolean = false;
let editingConnectionId: string = "";

/**
 * Creates a new connection state object.
 * @param options - Optional initial values for the connection
 * @returns A new ConnectionState
 */
export function createConnectionState(options: CreateConnectionOptions = {}): ConnectionState {
    const id = `connection-${connectionCounter}`;
    const connectionName = options.name || `Connection ${connectionCounter}`;
    connectionCounter += 1;

    return {
        id,
        name: connectionName,
        endpoint: options.endpoint || "",
        connected: false,
        connectionLabel: "Disconnected",
        payloadMode: options.payloadMode || "json",
        autoReconnect: false,
        protoText: options.protoText || "",
        jsonText: options.jsonText || "",
        responseText: "",
        schemaState: createSchemaState(),
        messageState: createMessageState(),
        stats: {
            rtt: null,
            timestamp: "",
            jsonBytes: 0,
            protoBytes: 0,
        },
        activeOneofValue: options.oneofValue || "",
        lastError: "",
        reconnectTimer: null,
        reconnectAttempt: 0,
        manualDisconnect: false,
    };
}

/**
 * Returns the currently active connection, or null if none.
 * @returns The active ConnectionState or null
 */
export function getActiveConnection(): ConnectionState | null {
    return connections.get(activeConnectionId) || null;
}

/**
 * Returns a connection by its ID.
 * @param connectionId - The connection ID to look up
 * @returns The ConnectionState or null
 */
export function getConnection(connectionId: string): ConnectionState | null {
    return connections.get(connectionId) || null;
}

/**
 * Returns the active connection ID.
 * @returns The active connection ID string
 */
export function getActiveConnectionId(): string {
    return activeConnectionId;
}

/**
 * Returns all connections as an array.
 * @returns Array of all ConnectionState objects
 */
export function getAllConnections(): ConnectionState[] {
    return Array.from(connections.values());
}

/**
 * Adds a connection state to the store.
 * @param connection - The connection state to add
 */
export function addConnectionState(connection: ConnectionState): void {
    connections.set(connection.id, connection);
}

/**
 * Renders the connections list in the sidebar.
 * @param elements - UI element references
 */
export function renderConnections(elements: UIElements): void {
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
        let nameElement: HTMLElement | null = null;
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
        editButton.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            startEditingConnectionName(connection.id, elements);
        });
        deleteButton.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            deleteConnection(connection.id, elements);
        });

        if (isEditing && nameElement) {
            const nameInput = nameElement as HTMLInputElement;
            mainButton.disabled = true;
            nameInput.focus();
            nameInput.select();
            nameInput.addEventListener("keydown", (event: KeyboardEvent) => {
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
                const name = item.querySelector(".connection-name") as HTMLElement | null;
                if (!name) {
                    return;
                }
                const fullName = name.dataset.fullName || "";
                if (fullName.length > 10) {
                    name.textContent = `${fullName.slice(0, 10)}...`;
                }
            });
            item.addEventListener("mouseleave", () => {
                const name = item.querySelector(".connection-name") as HTMLElement | null;
                if (!name) {
                    return;
                }
                name.textContent = name.dataset.fullName || "";
            });
        }

        elements.connectionsList.appendChild(item);
    }
}

/**
 * Starts editing a connection's name in the UI.
 */
function startEditingConnectionName(connectionId: string, elements: UIElements): void {
    if (!connections.has(connectionId)) {
        return;
    }

    editingConnectionId = connectionId;
    renderConnections(elements);
    requestAnimationFrame(() => {
        const selector = `.connection-name-input[data-connection-id="${connectionId}"]`;
        const input = elements.connectionsList?.querySelector(selector) as HTMLInputElement | null;
        if (input) {
            input.focus();
            input.select();
        }
    });
}

/**
 * Cancels editing a connection name.
 */
function cancelEditingConnectionName(elements: UIElements): void {
    editingConnectionId = "";
    renderConnections(elements);
}

/**
 * Commits a connection name change.
 */
function commitConnectionName(connectionId: string, nextName: string, elements: UIElements): void {
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

/**
 * Deletes a connection after user confirmation.
 */
function deleteConnection(connectionId: string, elements: UIElements): void {
    const connection = connections.get(connectionId);
    if (!connection) {
        return;
    }

    const confirmed = window.confirm(`Delete ${connection.name}?`);
    if (!confirmed) {
        return;
    }

    if (connection.reconnectTimer) {
        clearTimeout(connection.reconnectTimer);
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

/**
 * Sets the active connection directly (internal).
 */
function setActiveConnectionDirect(connectionId: string, elements: UIElements): void {
    if (!connections.has(connectionId)) {
        return;
    }

    activeConnectionId = connectionId;
    syncUIFromConnection(getActiveConnection()!, elements);
    renderConnections(elements);
}

/**
 * Sets the active connection by ID.
 * @param connectionId - The connection ID to activate
 * @param elements - UI element references
 */
export function setActiveConnection(connectionId: string, elements: UIElements): void {
    setActiveConnectionDirect(connectionId, elements);
}

/**
 * Synchronizes the UI to reflect a connection's state.
 * @param connection - The connection to sync from
 * @param elements - UI element references
 */
export function syncUIFromConnection(connection: ConnectionState | null, elements: UIElements): void {
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

    if (elements.autoReconnectCheckbox) {
        elements.autoReconnectCheckbox.checked = connection.autoReconnect || false;
        if (elements.autoReconnectLabel) {
            elements.autoReconnectLabel.classList.toggle(
                "is-reconnecting",
                connection.autoReconnect && !connection.connected && connection.reconnectTimer !== null
            );
        }
    }

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

/**
 * Returns whether the editors are currently being synced programmatically.
 * @returns True if syncing, false otherwise
 */
export function isSyncing(): boolean {
    return isSyncingEditors;
}

/**
 * Sets the syncing flag to prevent recursive editor change handlers.
 * @param value - The new syncing state
 */
export function setSyncing(value: boolean): void {
    isSyncingEditors = value;
}