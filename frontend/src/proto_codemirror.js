import { StreamLanguage } from "@codemirror/language";

export const protoKeywords = new Set([
    "syntax",
    "import",
    "package",
    "option",
    "message",
    "enum",
    "service",
    "rpc",
    "returns",
    "repeated",
    "required",
    "optional",
    "oneof",
    "reserved",
    "extend",
    "extensions",
    "map",
    "stream",
    "public",
    "weak",
]);

export const protoTypes = new Set([
    "double",
    "float",
    "int32",
    "int64",
    "uint32",
    "uint64",
    "sint32",
    "sint64",
    "fixed32",
    "fixed64",
    "sfixed32",
    "sfixed64",
    "bool",
    "string",
    "bytes",
]);

export const protoLanguage = StreamLanguage.define({
    startState() {
        return { level: 0 };
    },
    token(stream, state) {
        if (stream.sol() && /^\s*\}/.test(stream.string.slice(stream.pos))) {
            state.level = Math.max(0, state.level - 1);
        }

        if (stream.eatSpace()) {
            return null;
        }

        if (stream.match(/\/\/.*/)) {
            return "comment";
        }

        if (stream.match(/\/\*/)) {
            while (!stream.eol()) {
                if (stream.match(/\*\//)) {
                    break;
                }
                stream.next();
            }
            return "comment";
        }

        if (stream.match(/"(?:[^"\\]|\\.)*"/) || stream.match(/'(?:[^'\\]|\\.)*'/)) {
            return "string";
        }

        if (stream.match(/-?(?:0x[\da-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)/)) {
            return "number";
        }

        if (stream.match(/[{}\[\]();,=]/)) {
            if (stream.current() === "{") {
                state.level += 1;
            }
            return "bracket";
        }

        if (stream.match(/[A-Za-z_][\w.]*/)) {
            const word = stream.current();
            if (protoKeywords.has(word)) {
                return "keyword";
            }
            if (protoTypes.has(word)) {
                return "typeName";
            }
            if (word === "true" || word === "false") {
                return "atom";
            }
            return "variableName";
        }

        stream.next();
        return null;
    },
    indent(state, textAfter) {
        const reduce = /^\s*\}/.test(textAfter) ? 1 : 0;
        return Math.max(0, state.level - reduce) * 4;
    },
    languageData: {
        commentTokens: {
            line: "//",
            block: { open: "/*", close: "*/" },
        },
    },
});
