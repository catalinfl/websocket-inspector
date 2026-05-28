import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { protoLanguage } from "./proto_codemirror";

export const editorViews = new Map();
const editorChangeHandlers = new Map();

const editorConfig = {
    protoEditor: {
        doc: ``,
        language: protoLanguage,
    },
    jsonEditor: {
        doc: ``,
        language: json(),
    },
    responseEditor: {
        doc: ``,
        language: json(),
        readOnly: true,
    },
};


export function updateResponseEditor(text) {
    const view = editorViews.get("responseEditor");
    if (!view) {
        return;
    }

    setEditorText("responseEditor", text);
}

export function getEditorText(editorId) {
    const view = editorViews.get(editorId);
    return view ? view.state.doc.toString() : "";
}

export function setEditorText(editorId, text) {
    const view = editorViews.get(editorId);
    if (!view) {
        return;
    }

    view.dispatch({
        changes: {
            from: 0,
            to: view.state.doc.length,
            insert: text,
        },
    });
}

export function onEditorChange(editorId, handler) {
    if (!editorChangeHandlers.has(editorId)) {
        editorChangeHandlers.set(editorId, new Set());
    }

    const handlers = editorChangeHandlers.get(editorId);
    handlers.add(handler);
    return () => handlers.delete(handler);
}

function notifyEditorChange(editorId, view) {
    const handlers = editorChangeHandlers.get(editorId);
    if (!handlers || handlers.size === 0) {
        return;
    }

    const text = view.state.doc.toString();
    for (const handler of handlers) {
        handler(text, view);
    }
}

const editorTheme = EditorView.theme(
    {
        "&": {
            height: "100%",
            backgroundColor: "var(--workspace)",
            color: "var(--on-surface)",
        },
        ".cm-scroller": {
            fontFamily: "var(--font-code)",
            lineHeight: "1.5",
        },
        ".cm-content, .cm-gutters": {
            minHeight: "100%",
        },
        ".cm-content": {
            padding: "0 var(--panel-padding)",
            caretColor: "var(--on-surface)",
        },
        ".cm-line": {
            padding: "0 var(--panel-padding)",
        },
        ".cm-gutters": {
            backgroundColor: "var(--workspace)",
            color: "var(--on-surface-variant)",
            border: "none",
            borderRight: "1px solid var(--outline-variant)",
            padding: "12px 0",
        },
        ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "rgba(255, 255, 255, 0.03)",
        },
        ".cm-selectionBackground, ::selection": {
            backgroundColor: "rgba(159, 202, 255, 0.25)",
        },
        ".cm-content .tok-atom, .cm-content .tok-bool": {
            color: "#e3f4ff !important",
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--on-surface)",
        },
        ".cm-focused": {
            outline: "none",
        },
    },
    { dark: true },
);


function createEditor(parent, doc, languageExtension, readOnly = false, editorId = "") {
    const extensions = [
        basicSetup,
        editorTheme,
        EditorView.lineWrapping,
        // Force inline color for boolean tokens (true/false) to override theme
        EditorView.updateListener.of((update) => {
            if (!update.view) return;
            const spans = update.view.dom.querySelectorAll('.cm-content span');
            for (const s of spans) {
                const t = (s.textContent || "").trim();
                if (t === 'true' || t === 'false') {
                    s.style.color = '#e9f6ff';
                }
            }
        }),
        EditorView.updateListener.of((update) => {
            if (editorId && update.docChanged) {
                notifyEditorChange(editorId, update.view);
            }
        }),
        indentUnit.of("  "),
        languageExtension,
        EditorView.contentAttributes.of({ spellcheck: "false" }),
    ];

    if (readOnly) {
        extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    }

    const state = EditorState.create({
        doc,
        extensions,
    });

    const view = new EditorView({
        state,
        parent,
    });

    // Initial pass to apply colors
    setTimeout(() => {
        const spans = view.dom.querySelectorAll('.cm-content span');
        for (const s of spans) {
            const t = (s.textContent || "").trim();
            if (t === 'true' || t === 'false') {
                s.style.color = '#e9f6ff';
            }
        }
    }, 0);

    return view;
}

for (const [editorId, config] of Object.entries(editorConfig)) {
    const parent = document.getElementById(editorId);
    if (!parent) {
        continue;
    }

    editorViews.set(editorId, createEditor(parent, config.doc, config.language, config.readOnly, editorId));
}

export function parseJsonEditorValue() {
    const jsonText = getEditorText("jsonEditor");
    if (!jsonText.trim()) {
        return { value: null, text: jsonText };
    }

    return { value: JSON.parse(jsonText), text: jsonText };
}
