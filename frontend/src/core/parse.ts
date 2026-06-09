/**
 * Represents a parsed protobuf field.
 */
export interface ProtoField {
    name: string;
    type: string;
    repeated: boolean;
    map: boolean;
}

/**
 * Represents a parsed protobuf oneof block.
 */
export interface ProtoOneof {
    name: string;
    fields: ProtoField[];
}

/**
 * Represents a parsed protobuf message.
 */
export interface ProtoMessage {
    fields: ProtoField[];
    oneofs: ProtoOneof[];
}

/**
 * Represents a oneof option for the UI select element.
 */
export interface OneofOption {
    value: string;
    label: string;
    messageName: string;
    oneofName: string;
    fieldName: string;
    fieldType: string;
}

/**
 * Represents a fully parsed protobuf schema.
 */
export interface ParsedSchema {
    messages: Map<string, ProtoMessage>;
    oneofOptions: OneofOption[];
}

/** Map of protobuf scalar types to their default values. */
const scalarDefaults: Map<string, unknown> = new Map<string, unknown>([
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

/**
 * Detects message names that have a "// IGNORE" comment before them.
 * Must be called on the original source before stripping comments.
 * @param source - Raw .proto file content
 * @returns Set of message names to ignore
 */
export function detectIgnoredMessages(source: string): Set<string> {
    const ignored = new Set<string>();
    const regex = /^[ \t]*\/\/\s*IGNORE[^\n]*\n[ \t]*message\s+([A-Za-z_][\w]*)\s*\{/gm;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
        ignored.add(match[1]);
    }

    return ignored;
}

/**
 * Removes message blocks marked with "// IGNORE" from source.
 * Used to provide a clean source to protobufjs which doesn't understand IGNORE.
 * @param source - Raw .proto file content
 * @returns Source with ignored message blocks removed
 */
export function removeIgnoredBlocks(source: string): string {
    const blocks = extractBlocks(source, "message");
    const ignoreRegex = /^[ \t]*\/\/\s*IGNORE[^\n]*\n[ \t]*message\s+([A-Za-z_][\w]*)\s*\{/gm;
    const ranges: SourceRange[] = [];

    let m: RegExpExecArray | null;
    while ((m = ignoreRegex.exec(source)) !== null) {
        const name = m[1];
        const block = blocks.find((b) => b.name === name);
        if (block) {
            ranges.push({ start: m.index, end: block.end });
        }
    }

    if (ranges.length === 0) {
        return source;
    }

    return removeRanges(source, ranges);
}

/**
 * Parses a protobuf schema source string into a structured representation.
 * @param source - Raw .proto file content
 * @returns Parsed schema with messages and oneof options
 */
export function parseProtoSchema(source: string): ParsedSchema {
    const ignoredNames = detectIgnoredMessages(source);
    const cleaned = stripProtoComments(source);
    const messageBlocks = extractBlocks(cleaned, "message");
    const messages: Map<string, ProtoMessage> = new Map();
    const oneofOptions: OneofOption[] = [];

    for (const block of messageBlocks) {
        if (ignoredNames.has(block.name)) {
            continue;
        }
        const oneofBlocks = extractBlocks(block.body, "oneof");
        const cleanedBody = removeRanges(
            block.body,
            oneofBlocks.map((oneof) => ({ start: oneof.start, end: oneof.end }))
        );
        const fields = parseFields(cleanedBody);
        const oneofs: ProtoOneof[] = oneofBlocks.map((oneof) => ({
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

/**
 * Builds a JSON template object for a given message type.
 * @param messageName - Name of the protobuf message
 * @param schema - Parsed schema
 * @param depth - Current recursion depth (prevents infinite loops)
 * @returns A template object with default values
 */
export function buildMessageTemplate(messageName: string, schema: ParsedSchema, depth: number = 0): Record<string, unknown> {
    if (!schema || depth > 3) {
        return {};
    }

    const message = schema.messages.get(messageName);
    if (!message) {
        return {};
    }

    const template: Record<string, unknown> = {};
    for (const field of message.fields) {
        template[field.name] = buildFieldValue(field, schema, depth + 1);
    }

    return template;
}

/**
 * Builds a JSON template for a specific oneof option.
 * @param schema - Parsed schema
 * @param option - The selected oneof option
 * @returns A template object with the oneof field populated
 */
export function buildOneofTemplate(schema: ParsedSchema, option: OneofOption): Record<string, unknown> {
    if (!schema || !option) {
        return {};
    }

    const base = buildMessageTemplate(option.messageName, schema, 0);
    const payload = buildMessageTemplate(option.fieldType, schema, 0);
    base[option.fieldName] = payload;
    return base;
}

/**
 * Strips block and line comments from protobuf source.
 */
function stripProtoComments(source: string): string {
    const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
    return withoutBlock.replace(/\/\/.*$/gm, "");
}

/** Represents a block extracted from protobuf source. */
interface ExtractedBlock {
    name: string;
    start: number;
    end: number;
    body: string;
}

/**
 * Extracts all top-level blocks matching a keyword (e.g. "message", "oneof").
 */
function extractBlocks(source: string, keyword: string): ExtractedBlock[] {
    const blocks: ExtractedBlock[] = [];
    const regex = new RegExp(`\\b${keyword}\\s+([A-Za-z_][\\w]*)\\s*\\{`, "g");
    let match: RegExpExecArray | null;

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

/** Represents a range to remove from source. */
interface SourceRange {
    start: number;
    end: number;
}

/**
 * Replaces ranges in source with spaces (preserving character positions).
 */
function removeRanges(source: string, ranges: SourceRange[]): string {
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

/**
 * Parses field declarations from a protobuf body string.
 */
function parseFields(source: string): ProtoField[] {
    const fields: ProtoField[] = [];
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

/**
 * Builds a default value for a protobuf field.
 */
function buildFieldValue(field: ProtoField, schema: ParsedSchema, depth: number): unknown {
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