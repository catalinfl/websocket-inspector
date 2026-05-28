export function createErrorManager({
    errorsToggle,
    errorsPanel,
    errorsList,
    errorToast,
    errorToastMessage,
    setActiveErrorMessage,
    refreshStatus,
}) {
    const recentErrors = [];
    let errorToastTimer = null;

    if (errorsPanel) {
        errorsPanel.hidden = true;
    }

    if (errorsToggle) {
        errorsToggle.setAttribute("aria-expanded", "false");
    }

    if (errorsList) {
        errorsList.textContent = "";
    }

    function renderRecentErrors() {
        if (!errorsList) {
            return;
        }

        errorsList.textContent = "";

        if (recentErrors.length === 0) {
            const emptyState = document.createElement("div");
            emptyState.className = "error-empty";
            emptyState.textContent = "No errors";
            errorsList.appendChild(emptyState);
            return;
        }

        for (const entry of recentErrors) {
            const item = document.createElement("article");
            item.className = "error-item";

            const time = document.createElement("time");
            time.className = "error-item-time";
            time.textContent = entry.timestamp.toLocaleTimeString();

            const message = document.createElement("p");
            message.className = "error-item-message";
            message.textContent = entry.message;

            item.appendChild(time);
            item.appendChild(message);
            errorsList.appendChild(item);
        }
    }

    function hideErrorToast() {
        if (!errorToast) {
            return;
        }

        errorToast.classList.remove("is-visible");
        errorToast.setAttribute("aria-hidden", "true");
    }

    function showErrorToast(message) {
        if (!errorToast || !errorToastMessage) {
            return;
        }

        errorToastMessage.textContent = message;
        errorToast.setAttribute("aria-hidden", "false");
        errorToast.classList.add("is-visible");

        if (errorToastTimer) {
            clearTimeout(errorToastTimer);
        }

        errorToastTimer = window.setTimeout(() => {
            hideErrorToast();
        }, 5000);
    }

    function recordError(message) {
        const entry = {
            message: String(message),
            timestamp: new Date(),
        };

        recentErrors.unshift(entry);

        if (recentErrors.length > 8) {
            recentErrors.length = 8;
        }

        if (typeof setActiveErrorMessage === "function") {
            setActiveErrorMessage(entry.message);
        }

        if (typeof refreshStatus === "function") {
            refreshStatus();
        }

        showErrorToast(entry.message);

        if (errorsPanel && !errorsPanel.hidden) {
            renderRecentErrors();
            if (errorsList) {
                errorsList.scrollTop = 0;
            }
        }
    }

    if (errorsToggle && errorsPanel) {
        const hideErrorsPanel = () => {
            errorsToggle.setAttribute("aria-expanded", "false");
            errorsToggle.classList.remove("is-open");
            errorsPanel.hidden = true;
        };

        errorsToggle.addEventListener("click", () => {
            const isExpanded = errorsToggle.getAttribute("aria-expanded") === "true";

            if (isExpanded) {
                hideErrorsPanel();
                return;
            }

            errorsToggle.setAttribute("aria-expanded", "true");
            errorsToggle.classList.add("is-open");
            errorsPanel.hidden = false;
            renderRecentErrors();
        });
    }

    function recordConnectionError(connectionId, message, connection, callbacks) {
        if (connection) {
            connection.lastError = String(message);
        }

        if (callbacks && callbacks.recordError) {
            callbacks.recordError(message);
        }

        if (callbacks && callbacks.setErrorStatus) {
            callbacks.setErrorStatus(message, true);
        }
    }

    return {
        recordError,
        renderRecentErrors,
        hideErrorToast,
        showErrorToast,
        recentErrors,
        recordConnectionError
    };
}
