import { editorViews, updateResponseEditor, getEditorText } from "./editor";
import { updateSizeComparison } from "../utils";
import type { OneofOption } from "../core/parse";

/**
 * References to all UI DOM elements used throughout the application.
 */
export interface UIElements {
    advancedToggle: HTMLElement | null;
    advancedPanel: HTMLElement | null;
    fileTriggers: NodeListOf<HTMLElement>;
    panels: HTMLElement | null;
    connectionsList: HTMLElement | null;
    newConnectionButton: HTMLElement | null;
    websocketInput: HTMLInputElement | null;
    connectButton: HTMLButtonElement | null;
    sendButton: HTMLButtonElement | null;
    protoSchemaPanel: HTMLElement | null;
    schemaStatusTag: HTMLElement | null;
    schemaStatusText: HTMLElement | null;
    statusText: HTMLElement | null;
    statusDot: HTMLElement | null;
    statusSummary: HTMLElement | null;
    statusLastError: HTMLElement | null;
    parseSchemaButton: HTMLElement | null;
    payloadModeSelect: HTMLSelectElement | null;
    messageTypeBar: HTMLElement | null;
    messageTypeSelect: HTMLSelectElement | null;
    sizeComparison: HTMLElement | null;
    rttDisplay: HTMLElement | null;
    responseTimeDisplay: HTMLElement | null;
    rawHexButton: HTMLButtonElement | null;
    errorsToggle: HTMLElement | null;
    errorsPanel: HTMLElement | null;
    errorsList: HTMLElement | null;
    errorToast: HTMLElement | null;
    errorToastMessage: HTMLElement | null;
    autoReconnectCheckbox: HTMLInputElement | null;
    autoReconnectLabel: HTMLElement | null;
}

/**
 * All cached DOM element references used by the application.
 */
export const elements: UIElements = {
    advancedToggle: document.getElementById("advancedToggle"),
    advancedPanel: document.getElementById("advancedPanel"),
    fileTriggers: document.querySelectorAll("[data-file-trigger]"),
    panels: document.querySelector(".panels"),
    connectionsList: document.getElementById("connectionsList"),
    newConnectionButton: document.getElementById("newConnectionButton"),
    websocketInput: document.getElementById("websocketUrlInput") as HTMLInputElement | null,
    connectButton: document.getElementById("connectButton") as HTMLButtonElement | null,
    sendButton: document.getElementById("sendButton") as HTMLButtonElement | null,
    protoSchemaPanel: document.getElementById("protoSchemaPanel"),
    schemaStatusTag: document.getElementById("schemaStatusTag"),
    schemaStatusText: document.getElementById("schemaStatusText"),
    statusText: document.querySelector(".status-text"),
    statusDot: document.querySelector(".status-dot"),
    statusSummary: document.getElementById("statusSummary"),
    statusLastError: document.getElementById("statusLastError"),
    parseSchemaButton: document.getElementById("parseSchemaButton"),
    payloadModeSelect: document.getElementById("payloadModeSelect") as HTMLSelectElement | null,
    messageTypeBar: document.getElementById("messageTypeBar"),
    messageTypeSelect: document.getElementById("messageTypeSelect") as HTMLSelectElement | null,
    sizeComparison: document.getElementById("sizeComparison"),
    rttDisplay: document.getElementById("rttDisplay"),
    responseTimeDisplay: document.getElementById("responseTimeDisplay"),
    rawHexButton: document.getElementById("rawHexButton") as HTMLButtonElement | null,
    errorsToggle: document.getElementById("errorsToggle"),
    errorsPanel: document.getElementById("errorsPanel"),
    errorsList: document.getElementById("errorsList"),
    errorToast: document.getElementById("errorToast"),
    errorToastMessage: document.getElementById("errorToastMessage"),
    autoReconnectCheckbox: document.getElementById("autoReconnectCheckbox") as HTMLInputElement | null,
    autoReconnectLabel: document.getElementById("autoReconnectLabel"),
};

/**
 * Initializes the UI on page load.
 */
export function initializeUI(): void {
    if (elements.messageTypeBar) {
        elements.messageTypeBar.hidden = true;
    }
    if (elements.messageTypeSelect) {
        elements.messageTypeSelect.disabled = true;
    }
    if (elements.sizeComparison) {
        const jsonBytes = elements.sizeComparison.dataset.jsonBytes;
        const protoBytes = elements.sizeComparison.dataset.protoBytes;
        updateSizeComparison(elements.sizeComparison, Number(jsonBytes), Number(protoBytes));
    }
}

/**
 * Updates the connection status display.
 * @param text - The connection label text
 * @param connected - Whether the connection is active
 * @returns The display label
 */
export function setConnectionStatus(text: string, connected: boolean = false): string {
    const label = connected ? text : "Disconnected";

    if (elements.statusText) {
        elements.statusText.textContent = connected ? "Connected" : "Disconnected";
    }
    if (elements.statusDot) {
        elements.statusDot.classList.toggle("is-connected", connected);
        elements.statusDot.classList.toggle("is-disconnected", !connected);
    }
    if (elements.statusSummary) {
        elements.statusSummary.textContent = `v0.0.1 | WebSocket: ${label}`;
    }

    return label;
}

/**
 * Updates the connect/disconnect button state.
 * @param isConnected - Whether the connection is active
 */
export function updateConnectButtonState(isConnected: boolean): void {
    if (elements.connectButton) {
        elements.connectButton.textContent = isConnected ? "Disconnect" : "Connect";
    }
    if (elements.websocketInput) {
        elements.websocketInput.disabled = isConnected;
    }
}

/**
 * Updates the UI based on the current payload mode.
 * @param payloadMode - The payload mode ("json", "proto", or "raw")
 */
export function setPayloadModeUI(payloadMode: string): void {
    const isProto = payloadMode === "proto";

    if (elements.panels) {
        elements.panels.classList.toggle("is-two-column", !isProto);
    }

    if (elements.protoSchemaPanel) {
        elements.protoSchemaPanel.hidden = !isProto;
    }

    if (elements.messageTypeBar) {
        elements.messageTypeBar.hidden = !isProto;
    }

    if (elements.rawHexButton) {
        elements.rawHexButton.disabled = !isProto;
        if (!isProto) {
            elements.rawHexButton.classList.remove("is-active");
        }
    }

    if (elements.payloadModeSelect) {
        elements.payloadModeSelect.value = payloadMode || "json";
    }
}

/**
 * Updates the schema validation status display.
 * @param validationStatus - The validation status ("valid", "invalid", or "empty")
 */
export function setSchemaValidationStatus(validationStatus: string): void {
    if (!elements.schemaStatusTag) {
        return;
    }

    const isValid = validationStatus === "valid";
    const isInvalid = validationStatus === "invalid";
    const isVisible = isValid || isInvalid;

    elements.schemaStatusTag.hidden = !isVisible;
    elements.schemaStatusTag.classList.toggle("tag-success", isValid);
    elements.schemaStatusTag.classList.toggle("tag-error", isInvalid);

    elements.schemaStatusTag.textContent = "";

    if (isVisible) {
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = isValid ? "check_circle" : "error";
        elements.schemaStatusTag.appendChild(icon);
    }

    if (elements.schemaStatusText) {
        elements.schemaStatusTag.appendChild(elements.schemaStatusText);
        elements.schemaStatusText.textContent = isValid ? "Schema valid" : isInvalid ? "Schema invalid" : "";
    }
}

/**
 * Shows or hides the error status in the status bar.
 * @param message - The error message to display
 * @param show - Whether to show or hide the error
 */
export function setErrorStatus(message: string, show: boolean = true): void {
    if (elements.statusLastError) {
        if (show && message) {
            elements.statusLastError.hidden = false;
            elements.statusLastError.textContent = message;
        } else {
            elements.statusLastError.hidden = true;
            elements.statusLastError.textContent = "";
        }
    }
}

/**
 * Updates the message type (oneof) select dropdown.
 * @param options - Array of oneof options
 * @param selectedValue - The currently selected value
 * @returns The value that was actually selected
 */
export function updateMessageTypeSelect(options: OneofOption[], selectedValue: string = ""): string {
    if (!elements.messageTypeBar || !elements.messageTypeSelect) {
        return "";
    }

    elements.messageTypeSelect.textContent = "";

    if (options.length === 0) {
        elements.messageTypeBar.hidden = true;
        elements.messageTypeSelect.disabled = true;
        return "";
    }

    for (const option of options) {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        elements.messageTypeSelect.appendChild(element);
    }

    elements.messageTypeBar.hidden = false;
    elements.messageTypeSelect.disabled = false;
    const hasSelected = options.some((option) => option.value === selectedValue);
    const nextValue = hasSelected ? selectedValue : options[0].value;
    elements.messageTypeSelect.value = nextValue;
    return nextValue;
}

/**
 * Updates the RTT (round-trip time) display.
 * @param rtt - The RTT value in milliseconds
 */
export function updateRTTDisplay(rtt: number): void {
    if (elements.rttDisplay) {
        elements.rttDisplay.textContent = Number.isFinite(rtt) ? `RTT: ${rtt}ms` : "RTT: —";
    }
}

/**
 * Updates the timestamp display.
 * @param timestamp - The timestamp string
 */
export function updateTimestampDisplay(timestamp: string): void {
    if (elements.responseTimeDisplay) {
        elements.responseTimeDisplay.textContent = timestamp || "—";
    }
}

/**
 * Updates the size comparison display.
 * @param jsonBytes - JSON payload byte count
 * @param protoBytes - Protobuf payload byte count
 */
export function updateSizeDisplay(jsonBytes: number, protoBytes: number): void {
    updateSizeComparison(elements.sizeComparison, jsonBytes, protoBytes);
}

/**
 * Updates the response view with new content.
 * @param content - The text content to display
 */
export function updateResponseView(content: string): void {
    updateResponseEditor(content);
}

/**
 * Sets the active state of the raw hex button.
 * @param isActive - Whether the hex view is active
 */
export function setRawHexButtonActive(isActive: boolean): void {
    if (isActive) {
        elements.rawHexButton?.classList.add("is-active");
    } else {
        elements.rawHexButton?.classList.remove("is-active");
    }
}

/**
 * Gets the current JSON editor text.
 * @returns The JSON editor text content
 */
export function getJsonEditorText(): string {
    return getEditorText("jsonEditor");
}

/**
 * Sets the JSON editor value from a parsed object.
 * @param value - The object to serialize and set in the editor
 */
export function setJsonEditorValue(value: Record<string, unknown>): void {
    const jsonView = editorViews.get("jsonEditor");
    if (!jsonView) {
        return;
    }

    const text = JSON.stringify(value, null, 2);
    jsonView.dispatch({
        changes: {
            from: 0,
            to: jsonView.state.doc.length,
            insert: text,
        },
    });
}

/**
 * Sets up file import buttons that trigger hidden file inputs.
 */
export function setupFileImports(): void {
    elements.fileTriggers.forEach((button: HTMLElement) => {
        const inputId = button.getAttribute("data-file-trigger");
        const fileInput = inputId ? document.getElementById(inputId) as HTMLInputElement | null : null;

        if (!fileInput) {
            return;
        }

        button.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", () => {
            const [file] = fileInput.files || [];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                const targetId = fileInput.dataset.fileFor;
                const view = targetId ? editorViews.get(targetId) : null;
                if (!view) {
                    return;
                }

                const text = String(reader.result || "");
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: text,
                    },
                });
            };

            reader.readAsText(file);
            fileInput.value = "";
        });
    });
}

/**
 * Sets up the advanced toggle button to show/hide the advanced panel.
 */
export function setupAdvancedToggle(): void {
    if (elements.advancedToggle && elements.advancedPanel) {
        elements.advancedToggle.addEventListener("click", () => {
            const isExpanded = elements.advancedToggle!.getAttribute("aria-expanded") === "true";
            elements.advancedToggle!.setAttribute("aria-expanded", String(!isExpanded));
            elements.advancedToggle!.classList.toggle("is-open", !isExpanded);
            elements.advancedPanel!.hidden = isExpanded;
        });
    }
}