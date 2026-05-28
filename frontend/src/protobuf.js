import * as protobuf from "protobufjs";

export function loadProtoRoot(source) {
    if (!source || !source.trim()) {
        throw new Error("Proto schema is empty");
    }

    const parsed = protobuf.parse(source, { keepCase: true });
    return parsed.root;
}

export function verifyMessagePayload(root, messageName, payload) {
    const type = resolveMessageType(root, messageName);
    if (!type) {
        return `Message type "${messageName}" not found in schema`;
    }

    return type.verify(payload);
}

export function encodeMessagePayload(root, messageName, payload) {
    const type = resolveMessageType(root, messageName);
    if (!type) {
        throw new Error(`Message type "${messageName}" not found in schema`);
    }

    const message = type.fromObject(payload);
    return type.encode(message).finish();
}

export function decodeMessagePayload(root, messageName, bytes) {
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
    });
}

function resolveMessageType(root, messageName) {
    if (!root || !messageName) {
        return null;
    }

    try {
        return root.lookupType(messageName);
    } catch (error) {
        return findTypeByName(root, messageName);
    }
}

function findTypeByName(root, messageName) {
    const stack = [root];

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current) continue;

        if (current instanceof protobuf.Type && current.name === messageName) {
            return current;
        }

        let children = [];

        if (current.nestedArray) {
            children = current.nestedArray;
        } else if (current.nested) {
            children = Object.values(current.nested)
        }

        for (const child of children) {
            stack.push(child)
        }
    }

    return null;
}
