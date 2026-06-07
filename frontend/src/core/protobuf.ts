import * as protobuf from "protobufjs";

/**
 * Loads a protobuf root from a source string.
 * @param source - Raw .proto file content
 * @returns The parsed protobuf root
 * @throws If the schema is empty or invalid
 */
export function loadProtoRoot(source: string): protobuf.Root {
    if (!source || !source.trim()) {
        throw new Error("Proto schema is empty");
    }

    const parsed = protobuf.parse(source, { keepCase: true });
    return parsed.root;
}

/**
 * Verifies a JSON payload against a protobuf message definition.
 * @param root - The protobuf root
 * @param messageName - Name of the message type
 * @param payload - The JSON payload to verify
 * @returns An error message string if invalid, or null if valid
 */
export function verifyMessagePayload(root: protobuf.Root, messageName: string, payload: Record<string, unknown>): string | null {
    const type = resolveMessageType(root, messageName);
    if (!type) {
        return `Message type "${messageName}" not found in schema`;
    }

    return type.verify(payload);
}

/**
 * Encodes a JSON payload into protobuf binary format.
 * @param root - The protobuf root
 * @param messageName - Name of the message type
 * @param payload - The JSON payload to encode
 * @returns The encoded protobuf bytes
 * @throws If the message type is not found
 */
export function encodeMessagePayload(root: protobuf.Root, messageName: string, payload: Record<string, unknown>): Uint8Array {
    const type = resolveMessageType(root, messageName);
    if (!type) {
        throw new Error(`Message type "${messageName}" not found in schema`);
    }

    const message = type.fromObject(payload);
    return type.encode(message).finish();
}

/**
 * Decodes protobuf binary data into a JSON object.
 * @param root - The protobuf root
 * @param messageName - Name of the message type
 * @param bytes - The encoded protobuf bytes
 * @returns The decoded JSON object
 * @throws If the message type is not found
 */
export function decodeMessagePayload(root: protobuf.Root, messageName: string, bytes: Uint8Array): Record<string, unknown> {
    const type = resolveMessageType(root, messageName);
    if (!type) {
        throw new Error(`Message type "${messageName}" not found in schema`);
    }

    const message = type.decode(bytes);
    return type.toObject(message, {
        longs: String,
        enums: String,
        bytes: String,
        defaults: true,
        arrays: true,
        objects: true,
        oneofs: true,
    }) as Record<string, unknown>;
}

/**
 * Resolves a message type by name from the protobuf root.
 * Tries direct lookup first, then falls back to recursive search.
 */
function resolveMessageType(root: protobuf.Root, messageName: string): protobuf.Type | null {
    if (!root || !messageName) {
        return null;
    }

    try {
        return root.lookupType(messageName);
    } catch (_error: unknown) {
        return findTypeByName(root, messageName);
    }
}

/**
 * Recursively searches for a message type by name in the protobuf root.
 */
function findTypeByName(root: protobuf.ReflectionObject, messageName: string): protobuf.Type | null {
    const stack: protobuf.ReflectionObject[] = [root];

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current) continue;

        if (current instanceof protobuf.Type && current.name === messageName) {
            return current;
        }

        let children: protobuf.ReflectionObject[] = [];

        if ((current as protobuf.ReflectionObject & { nestedArray?: protobuf.ReflectionObject[] }).nestedArray) {
            children = (current as protobuf.ReflectionObject & { nestedArray: protobuf.ReflectionObject[] }).nestedArray;
        } else if ((current as protobuf.ReflectionObject & { nested?: Record<string, protobuf.ReflectionObject> }).nested) {
            children = Object.values((current as protobuf.ReflectionObject & { nested: Record<string, protobuf.ReflectionObject> }).nested);
        }

        for (const child of children) {
            stack.push(child);
        }
    }

    return null;
}