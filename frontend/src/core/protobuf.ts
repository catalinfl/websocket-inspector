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
 * Collects all message type names defined in a protobuf root.
 * @param root - The protobuf root
 * @returns Array of fully-qualified and short message type names
 */
export function collectMessageNames(root: protobuf.Root): string[] {
    const names: string[] = [];
    const seen = new Set<string>();

    function walk(namespace: protobuf.Namespace): void {
        const nested = (namespace as protobuf.Namespace).nested;
        if (!nested) { // if nested doesn't exists as object, searches for array
            const nestedArray = (namespace as protobuf.Namespace).nestedArray;
            if (nestedArray) { // { "gamepb": Namespace, "ClientMessage": Type, "AutoQueue": Type...}
                for (const child of nestedArray) { // verify the nested array built in protobuf.js
                    if (child instanceof protobuf.Type) { // check if it is a message
                        const fullName = child.fullName;
                        if (fullName && !seen.has(fullName)) {
                            seen.add(fullName);
                            names.push(child.name);
                        }
                    } else if (child instanceof protobuf.Namespace) {
                        walk(child);
                    }
                }
            }
            return; // returns for nested array
        }

        // case of nested as object
        for (const child of Object.values(nested)) {
            if (child instanceof protobuf.Type) {
                const fullName = child.fullName;
                if (fullName && !seen.has(fullName)) {
                    seen.add(fullName);
                    names.push(child.name);
                }
            } else if (child instanceof protobuf.Namespace) {
                walk(child);
            }
        }
    }

    walk(root);
    return names;
}

const DECODE_OPTIONS: {
    longs: typeof String; // "123" instead of Long
    enums: typeof String; // enum becomes a string instead of a number
    bytes: typeof String; // Uint8array
    defaults: boolean; // default value of fields
    arrays: boolean;
    objects: boolean;
    oneofs: boolean;
} = {
    longs: String,
    enums: String,
    bytes: String,
    defaults: true,
    arrays: true,
    objects: true,
    oneofs: true,
};

/**
 * Tries to decode binary data using all known message types,
 * returning the result from the type that best matches the data.
 * Prefers the activeMessageName if it decodes successfully with content,
 * otherwise tries all types and picks the best match.
 *
 * @param root - The protobuf root
 * @param messageNames - All available message type names
 * @param activeMessageName - The preferred message type name
 * @param bytes - The binary data to decode
 * @returns The decoded object and the message name that was used, or null if none matched
 */
export function tryDecodeWithAllTypes(
    root: protobuf.Root,
    messageNames: string[],
    activeMessageName: string,
    bytes: Uint8Array
): { decoded: Record<string, unknown>; messageName: string } | null {
    const orderedNames = [activeMessageName, ...messageNames.filter(n => n !== activeMessageName)];

    let bestResult: Record<string, unknown> | null = null;
    let bestName = "";
    let bestScore = 0;

    for (const name of orderedNames) {
        try {
            const type = resolveMessageType(root, name);
            if (!type) continue;

            const message = type.decode(bytes);
            const decoded = type.toObject(message, DECODE_OPTIONS) as Record<string, unknown>;

            const score = scoreDecodedMessage(decoded, type);
            if (score > bestScore) {
                bestScore = score;
                bestResult = decoded;
                bestName = name;

                if (score >= 2) {
                    return { decoded: bestResult, messageName: bestName };
                }
            }
        } catch {
            continue;
        }
    }

    if (bestResult && bestScore > 0) {
        return { decoded: bestResult, messageName: bestName };
    }

    return null;
}

/**
 * Scores a decoded protobuf message based on how much meaningful content it has.
 * A higher score means the message type is more likely the correct one for the data.
 */
function scoreDecodedMessage(decoded: Record<string, unknown>, type: protobuf.Type): number {
    let score = 0;

    for (const [key, value] of Object.entries(decoded)) {
        if (value === null || value === undefined) continue;

        const field = type.fields[key];
        if (!field) continue;

        if (field.partOf) {
            if (typeof value === "string" && value !== "") {
                score += 3;
            } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                const obj = value as Record<string, unknown>;
                const hasContent = Object.values(obj).some(v =>
                    v !== null && v !== undefined && v !== "" && v !== 0 && v !== false
                );
                if (hasContent) score += 5;
            }
            continue;
        }

        if (field.repeated) {
            if (Array.isArray(value) && value.length > 0) score += 3;
            continue;
        }

        if (field.resolvedType && typeof value === "object" && value !== null) {
            const obj = value as Record<string, unknown>;
            const hasContent = Object.values(obj).some(v =>
                v !== null && v !== undefined && v !== "" && v !== 0 && v !== false
            );
            if (hasContent) score += 2;
            continue;
        }

        if (field.type === "string" && typeof value === "string" && value !== "") {
            score += 2;
            continue;
        }

        if (field.type === "bool" && typeof value === "boolean" && value) {
            score += 2;
            continue;
        }

        if (typeof value === "number" && value !== 0) {
            score += 1;
            continue;
        }
    }

    return score;
}

/**
 * Resolves a message type by name from the protobuf root.
 * Tries direct lookup first, then falls back to recursive search.
 */
export function resolveMessageType(root: protobuf.Root, messageName: string): protobuf.Type | null {
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