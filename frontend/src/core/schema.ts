import { buildOneofTemplate, parseProtoSchema, removeIgnoredBlocks, type ParsedSchema, type OneofOption } from "./parse";
import { loadProtoRoot, collectMessageNames } from "./protobuf";
import type { Root } from "protobufjs";

/**
 * Represents the state of a parsed protobuf schema for a connection.
 */
export interface SchemaState {
    parsedSchema: ParsedSchema | null;
    protoRoot: Root | null;
    activeMessageName: string;
    oneofOptionMap: Map<string, OneofOption>;
    validationStatus: string;
    validationMessage: string;
}

/**
 * Status information derived from a SchemaState.
 */
export interface SchemaStatus {
    isParsed: boolean;
    protoRoot: Root | null;
    activeMessageName: string;
    hasOneofOptions: boolean;
    oneofOptions: OneofOption[];
    messageNames: string[];
    validationStatus: string;
    validationMessage: string;
}

/**
 * Callbacks for schema parsing operations.
 */
export interface SchemaCallbacks {
    recordError: (message: string) => void;
}

/**
 * Callbacks for connection-level schema parsing.
 */
export interface ConnectionSchemaCallbacks {
    recordConnectionError: (connectionId: string, message: string) => void;
    updateMessageTypeSelect?: (options: OneofOption[], selectedValue: string) => string;
    selectOneof?: (value: string, schemaState: SchemaState) => Record<string, unknown> | null;
    setJsonEditorValue?: (value: Record<string, unknown>) => void;
}

/**
 * Creates a new empty schema state.
 * @returns A fresh SchemaState
 */
export function createSchemaState(): SchemaState {
    return {
        parsedSchema: null,
        protoRoot: null,
        activeMessageName: "",
        oneofOptionMap: new Map(),
        validationStatus: "empty",
        validationMessage: "",
    };
}

/**
 * Parses a protobuf schema source and updates the schema state.
 * @param protoSource - Raw .proto file content
 * @param schemaState - The schema state to update
 * @param callbacks - Error reporting callbacks
 * @returns True if parsing succeeded, false otherwise
 */
export function parseSchema(protoSource: string, schemaState: SchemaState, callbacks: SchemaCallbacks): boolean {
    if (!protoSource || !protoSource.trim()) {
        callbacks.recordError("Proto schema is empty");
        return false;
    }

    try {
        const schema = parseProtoSchema(protoSource);
        const cleanSource = removeIgnoredBlocks(protoSource);
        const root = loadProtoRoot(cleanSource);
        schemaState.parsedSchema = schema;
        schemaState.protoRoot = root;
        schemaState.oneofOptionMap = new Map(schema.oneofOptions.map((option) => [option.value, option]));
        schemaState.activeMessageName = "";
        schemaState.validationStatus = "valid";
        schemaState.validationMessage = "Schema valid";
        return true;
    } catch (error: unknown) {
        schemaState.parsedSchema = null;
        schemaState.protoRoot = null;
        schemaState.oneofOptionMap = new Map();
        schemaState.activeMessageName = "";
        schemaState.validationStatus = "invalid";
        schemaState.validationMessage = "Schema invalid";
        callbacks.recordError(error instanceof Error ? error.message : String(error));
        return false;
    }
}

/**
 * Selects a oneof option and returns a template for it.
 * @param value - The oneof option value to select
 * @param schemaState - The current schema state
 * @returns A template object or null if not found
 */
export function selectOneof(value: string, schemaState: SchemaState): Record<string, unknown> | null {
    const option = schemaState.oneofOptionMap.get(value);
    if (!option) {
        return null;
    }
    schemaState.activeMessageName = option.messageName;
    return buildOneofTemplate(schemaState.parsedSchema!, option);
}

/**
 * Gets the current status of a schema state.
 * @param schemaState - The schema state to query
 * @returns A SchemaStatus object with derived information
 */
export function getSchemaStatus(schemaState: SchemaState): SchemaStatus {
    const messageNames = schemaState.parsedSchema
        ? Array.from(schemaState.parsedSchema.messages.keys())
        : [];

    return {
        isParsed: !!schemaState.protoRoot,
        protoRoot: schemaState.protoRoot,
        activeMessageName: schemaState.activeMessageName,
        hasOneofOptions: schemaState.oneofOptionMap.size > 0,
        oneofOptions: Array.from(schemaState.oneofOptionMap.values()),
        messageNames,
        validationStatus: schemaState.validationStatus || "empty",
        validationMessage: schemaState.validationMessage || "",
    };
}

/**
 * Options for parseSchemaForConnection.
 */
export interface ParseSchemaOptions {
    applyTemplate?: boolean;
    preferOneofValue?: string;
}

/**
 * Parses a schema for a specific connection and updates UI state.
 * @param connection - The connection object with protoText and schemaState
 * @param options - Parsing options
 * @param callbacks - UI update callbacks
 * @returns True if parsing succeeded, false otherwise
 */
export function parseSchemaForConnection(
    connection: { id: string; protoText: string; schemaState: SchemaState; activeOneofValue: string },
    { applyTemplate = false, preferOneofValue = "" }: ParseSchemaOptions = {},
    callbacks: ConnectionSchemaCallbacks
): boolean {
    if (!connection) {
        return false;
    }

    const success = parseSchema(connection.protoText, connection.schemaState, {
        recordError: (message: string) => {
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