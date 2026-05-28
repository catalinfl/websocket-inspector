import { buildOneofTemplate, parseProtoSchema } from "./parse";
import { loadProtoRoot } from "./protobuf";

export function createSchemaState() {
    return {
        parsedSchema: null,
        protoRoot: null,
        activeMessageName: "",
        oneofOptionMap: new Map(),
        validationStatus: "empty",
        validationMessage: "",
    };
}

export function parseSchema(protoSource, schemaState, callbacks) {
    if (!protoSource || !protoSource.trim()) {
        callbacks.recordError("Proto schema is empty");
        return false;
    }

    try {
        const schema = parseProtoSchema(protoSource);
        const root = loadProtoRoot(protoSource);
        schemaState.parsedSchema = schema;
        schemaState.protoRoot = root;
        schemaState.oneofOptionMap = new Map(schema.oneofOptions.map((option) => [option.value, option]));
        schemaState.validationStatus = "valid";
        schemaState.validationMessage = "Schema valid";
        return true;
    } catch (error) {
        schemaState.parsedSchema = null;
        schemaState.protoRoot = null;
        schemaState.oneofOptionMap = new Map();
        schemaState.validationStatus = "invalid";
        schemaState.validationMessage = "Schema invalid";
        callbacks.recordError(error instanceof Error ? error.message : String(error));
        return false;
    }
}

export function selectOneof(value, schemaState) {
    const option = schemaState.oneofOptionMap.get(value);
    if (!option) {
        return null;
    }
    schemaState.activeMessageName = option.messageName;
    return buildOneofTemplate(schemaState.parsedSchema, option);
}

export function getSchemaStatus(schemaState) {
    return {
        isParsed: !!schemaState.protoRoot,
        protoRoot: schemaState.protoRoot,
        activeMessageName: schemaState.activeMessageName,
        hasOneofOptions: schemaState.oneofOptionMap.size > 0,
        oneofOptions: Array.from(schemaState.oneofOptionMap.values()),
        validationStatus: schemaState.validationStatus || "empty",
        validationMessage: schemaState.validationMessage || "",
    };
}

export function parseSchemaForConnection(connection, { applyTemplate = false, preferOneofValue = "" } = {}, callbacks) {
    if (!connection) {
        return false;
    }

    const success = parseSchema(connection.protoText, connection.schemaState, {
        recordError: (message) => {
            if (callbacks && callbacks.recordConnectionError) {
                callbacks.recordConnectionError(connection.id, message);
            }
        },
    });

    if (!success) {
        connection.activeOneofValue = "";
        if (callbacks && callbacks.updateMessageTypeSelect) {
            callbacks.updateMessageTypeSelect([], "");
        }
        return false;
    }

    const { oneofOptions } = getSchemaStatus(connection.schemaState);
    const preferredValue = preferOneofValue || connection.activeOneofValue;
    const selectedValue = oneofOptions.some((option) => option.value === preferredValue)
        ? preferredValue
        : oneofOptions[0]?.value || "";

    if (selectedValue) {
        connection.activeOneofValue = selectedValue;
        if (callbacks && callbacks.selectOneof) {
            const template = callbacks.selectOneof(selectedValue, connection.schemaState);
            if (applyTemplate && template && callbacks.setJsonEditorValue) {
                callbacks.setJsonEditorValue(template);
            }
        }
    }

    if (callbacks && callbacks.updateMessageTypeSelect) {
        callbacks.updateMessageTypeSelect(oneofOptions, connection.activeOneofValue);
    }

    return true;
}
