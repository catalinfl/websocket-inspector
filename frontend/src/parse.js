const scalarDefaults = new Map([
    ["double", 0],
    ["float", 0],
    ["int32", 0],
    ["int64", 0],
    ["uint32", 0],
    ["uint64", 0],
    ["sint32", 0],
    ["sint64", 0],
    ["fixed32", 0],
    ["fixed64", 0],
    ["sfixed32", 0],
    ["sfixed64", 0],
    ["bool", false],
    ["string", ""],
    ["bytes", ""],
]);

export function parseProtoSchema(source) {
    const cleaned = stripProtoComments(source);
    const messageBlocks = extractBlocks(cleaned, "message");
    const messages = new Map();
    const oneofOptions = [];

    for (const block of messageBlocks) {
        const oneofBlocks = extractBlocks(block.body, "oneof");
        const cleanedBody = removeRanges(
            block.body,
            oneofBlocks.map((oneof) => ({ start: oneof.start, end: oneof.end }))
        );
        const fields = parseFields(cleanedBody);
        const oneofs = oneofBlocks.map((oneof) => ({
            name: oneof.name,
            fields: parseFields(oneof.body),
        }));

        messages.set(block.name, { fields, oneofs });

        for (const oneof of oneofs) {
            for (const field of oneof.fields) {
                const value = `${block.name}|${oneof.name}|${field.name}`;
                const label = `${block.name}.${oneof.name}: ${field.name} (${field.type})`;
                oneofOptions.push({
                    value,
                    label,
                    messageName: block.name,
                    oneofName: oneof.name,
                    fieldName: field.name,
                    fieldType: field.type,
                });
            }
        }
    }

    return { messages, oneofOptions };
}

export function buildMessageTemplate(messageName, schema, depth = 0) {
    if (!schema || depth > 3) {
        return {};
    }

    const message = schema.messages.get(messageName);
    if (!message) {
        return {};
    }

    const template = {};
    for (const field of message.fields) {
        template[field.name] = buildFieldValue(field, schema, depth + 1);
    }

    return template;
}

export function buildOneofTemplate(schema, option) {
    if (!schema || !option) {
        return {};
    }

    const base = buildMessageTemplate(option.messageName, schema, 0);
    const payload = buildMessageTemplate(option.fieldType, schema, 0);
    base[option.fieldName] = payload;
    return base;
}

function stripProtoComments(source) {
    const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
    return withoutBlock.replace(/\/\/.*$/gm, "");
}

function extractBlocks(source, keyword) {
    const blocks = [];
    const regex = new RegExp(`\\b${keyword}\\s+([A-Za-z_][\\w]*)\\s*\\{`, "g");
    let match;

    while ((match = regex.exec(source)) !== null) {
        const name = match[1];
        const braceStart = source.indexOf("{", match.index + match[0].length - 1);
        let index = braceStart + 1;
        let depth = 1;

        for (; index < source.length; index += 1) {
            const ch = source[index];
            if (ch === "{") {
                depth += 1;
            } else if (ch === "}") {
                depth -= 1;
            }

            if (depth === 0) {
                break;
            }
        }

        if (depth !== 0) {
            break;
        }

        blocks.push({
            name,
            start: match.index,
            end: index + 1,
            body: source.slice(braceStart + 1, index),
        });

        regex.lastIndex = index + 1;
    }

    return blocks;
}

function removeRanges(source, ranges) {
    if (ranges.length === 0) {
        return source;
    }

    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    let result = "";
    let cursor = 0;

    for (const range of sorted) {
        result += source.slice(cursor, range.start);
        result += " ".repeat(Math.max(0, range.end - range.start));
        cursor = range.end;
    }

    result += source.slice(cursor);
    return result;
}

function parseFields(source) {
    const fields = [];
    const lines = source.split(/\r?\n/);

    for (const line of lines) {
        const match = line.match(/^\s*(repeated\s+)?(map<[^>]+>|\w+)\s+(\w+)\s*=\s*\d+/);
        if (!match) {
            continue;
        }

        const type = match[2];
        fields.push({
            name: match[3],
            type,
            repeated: Boolean(match[1]),
            map: type.startsWith("map<"),
        });
    }

    return fields;
}

function buildFieldValue(field, schema, depth) {
    if (field.map) {
        return {};
    }

    if (field.repeated) {
        return [];
    }

    if (scalarDefaults.has(field.type)) {
        return scalarDefaults.get(field.type);
    }

    return buildMessageTemplate(field.type, schema, depth + 1);
}
