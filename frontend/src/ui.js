import { editorViews, updateResponseEditor, getEditorText } from "./editor";
import { updateSizeComparison } from "./utils";

export const elements = {
    advancedToggle: document.getElementById("advancedToggle"),
    advancedPanel: document.getElementById("advancedPanel"),
    fileTriggers: document.querySelectorAll("[data-file-trigger]"),
    panels: document.querySelector(".panels"),
    connectionsList: document.getElementById("connectionsList"),
    newConnectionButton: document.getElementById("newConnectionButton"),
    websocketInput: document.getElementById("websocketUrlInput"),
    connectButton: document.getElementById("connectButton"),
    sendButton: document.getElementById("sendButton"),
    protoSchemaPanel: document.getElementById("protoSchemaPanel"),
    schemaStatusTag: document.getElementById("schemaStatusTag"),
    schemaStatusText: document.getElementById("schemaStatusText"),
    statusText: document.querySelector(".status-text"),
    statusDot: document.querySelector(".status-dot"),
    statusSummary: document.getElementById("statusSummary"),
    statusLastError: document.getElementById("statusLastError"),
    parseSchemaButton: document.getElementById("parseSchemaButton"),
    payloadModeSelect: document.getElementById("payloadModeSelect"),
    messageTypeBar: document.getElementById("messageTypeBar"),
    messageTypeSelect: document.getElementById("messageTypeSelect"),
    sizeComparison: document.getElementById("sizeComparison"),
    rttDisplay: document.getElementById("rttDisplay"),
    responseTimeDisplay: document.getElementById("responseTimeDisplay"),
    rawHexButton: document.getElementById("rawHexButton"),
    errorsToggle: document.getElementById("errorsToggle"),
    errorsPanel: document.getElementById("errorsPanel"),
    errorsList: document.getElementById("errorsList"),
    errorToast: document.getElementById("errorToast"),
    errorToastMessage: document.getElementById("errorToastMessage"),
};

export function initializeUI() {
    if (elements.messageTypeBar) {
        elements.messageTypeBar.hidden = true;
    }
    if (elements.messageTypeSelect) {
        elements.messageTypeSelect.disabled = true;
    }
    if (elements.sizeComparison) {
        const jsonBytes = elements.sizeComparison.dataset.jsonBytes;
        const protoBytes = elements.sizeComparison.dataset.protoBytes;
        updateSizeComparison(elements.sizeComparison, jsonBytes, protoBytes);
    }
}

export function setConnectionStatus(text, connected = false) {
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

export function updateConnectButtonState(isConnected) {
    if (elements.connectButton) {
        elements.connectButton.textContent = isConnected ? "Disconnect" : "Connect";
    }
    if (elements.websocketInput) {
        elements.websocketInput.disabled = isConnected;
    }
}

export function setPayloadModeUI(payloadMode) {
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

export function setSchemaValidationStatus(validationStatus) {
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

export function setErrorStatus(message, show = true) {
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

export function updateMessageTypeSelect(options, selectedValue = "") {
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

export function updateRTTDisplay(rtt) {
    if (elements.rttDisplay) {
        elements.rttDisplay.textContent = Number.isFinite(rtt) ? `RTT: ${rtt}ms` : "RTT: —";
    }
}

export function updateTimestampDisplay(timestamp) {
    if (elements.responseTimeDisplay) {
        elements.responseTimeDisplay.textContent = timestamp || "—";
    }
}

export function updateSizeDisplay(jsonBytes, protoBytes) {
    updateSizeComparison(elements.sizeComparison, jsonBytes, protoBytes);
}

export function updateResponseView(content) {
    updateResponseEditor(content);
}

export function setRawHexButtonActive(isActive) {
    if (isActive) {
        elements.rawHexButton?.classList.add("is-active");
    } else {
        elements.rawHexButton?.classList.remove("is-active");
    }
}

export function getJsonEditorText() {
    return getEditorText("jsonEditor");
}

export function setJsonEditorValue(value) {
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

export function setupFileImports() {
    elements.fileTriggers.forEach((button) => {
        const inputId = button.getAttribute("data-file-trigger");
        const fileInput = inputId ? document.getElementById(inputId) : null;

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

export function setupAdvancedToggle() {
    if (elements.advancedToggle && elements.advancedPanel) {
        elements.advancedToggle.addEventListener("click", () => {
            const isExpanded = elements.advancedToggle.getAttribute("aria-expanded") === "true";
            elements.advancedToggle.setAttribute("aria-expanded", String(!isExpanded));
            elements.advancedToggle.classList.toggle("is-open", !isExpanded);
            elements.advancedPanel.hidden = isExpanded;
        });
    }
}
