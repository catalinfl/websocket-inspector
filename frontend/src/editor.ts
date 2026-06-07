import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { indentUnit, StreamLanguage } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { protoLanguage } from "./proto_codemirror";

/**
 * Map of editor IDs to their EditorView instances.
 */
export const editorViews: Map<string, EditorView> = new Map();

/** Set of change handler functions keyed by editor ID. */
const editorChangeHandlers: Map<string, Set<(text: string, view: EditorView) => void>> = new Map();

/** Configuration for each editor instance. */
interface EditorConfig {
    doc: string;
    language: ReturnType<typeof json> | ReturnType<typeof StreamLanguage.define<{ level: number }>>;
    readOnly?: boolean;
}

const editorConfig: Record<string, EditorConfig> = {
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

/**
 * Updates the response editor with new text content.
 * @param text - The text to set in the response editor
 */
export function updateResponseEditor(text: string): void {
    const view = editorViews.get("responseEditor");
    if (!view) {
        return;
    }

    setEditorText("responseEditor", text);
}

/**
 * Gets the current text content of an editor by its ID.
 * @param editorId - The editor element ID
 * @returns The current editor text content
 */
export function getEditorText(editorId: string): string {
    const view = editorViews.get(editorId);
    return view ? view.state.doc.toString() : "";
}

/**
 * Sets the text content of an editor by its ID.
 * @param editorId - The editor element ID
 * @param text - The text to set
 */
export function setEditorText(editorId: string, text: string): void {
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

/**
 * Registers a change handler for a specific editor.
 * @param editorId - The editor element ID
 * @param handler - Callback invoked with the new text and editor view on changes
 * @returns A cleanup function that removes the handler
 */
export function onEditorChange(editorId: string, handler: (text: string, view: EditorView) => void): () => void {
    if (!editorChangeHandlers.has(editorId)) {
        editorChangeHandlers.set(editorId, new Set());
    }

    const handlers = editorChangeHandlers.get(editorId)!;
    handlers.add(handler);
    return () => handlers.delete(handler);
}

/**
 * Notifies all registered change handlers for an editor.
 */
function notifyEditorChange(editorId: string, view: EditorView): void {
    const handlers = editorChangeHandlers.get(editorId);
    if (!handlers || handlers.size === 0) {
        return;
    }

    const text = view.state.doc.toString();
    for (const handler of handlers) {
        handler(text, view);
    }
}

/** CodeMirror editor theme configuration. */
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

/**
 * Creates a CodeMirror editor instance.
 * @param parent - The parent DOM element
 * @param doc - Initial document content
 * @param languageExtension - The language extension for syntax highlighting
 * @param readOnly - Whether the editor is read-only
 * @param editorId - The editor ID for change notifications
 * @returns The created EditorView instance
 */
function createEditor(parent: HTMLElement, doc: string, languageExtension: ReturnType<typeof json> | ReturnType<typeof StreamLanguage.define<{ level: number }>>, readOnly: boolean = false, editorId: string = ""): EditorView {
    const extensions: import("@codemirror/state").Extension[] = [
        basicSetup,
        editorTheme,
        EditorView.lineWrapping,
        // Force inline color for boolean tokens (true/false) to override theme
        EditorView.updateListener.of((update: { view: EditorView }) => {
            if (!update.view) return;
            const spans = update.view.dom.querySelectorAll('.cm-content span');
            for (const s of spans) {
                const t = (s.textContent || "").trim();
                if (t === 'true' || t === 'false') {
                    (s as HTMLElement).style.color = '#e9f6ff';
                }
            }
        }),
        EditorView.updateListener.of((update: { docChanged: boolean; view: EditorView }) => {
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
                (s as HTMLElement).style.color = '#e9f6ff';
            }
        }
    }, 0);

    return view;
}

// Initialize all editors from the configuration
for (const [editorId, config] of Object.entries(editorConfig)) {
    const parent = document.getElementById(editorId);
    if (!parent) {
        continue;
    }

    editorViews.set(editorId, createEditor(parent, config.doc, config.language, config.readOnly, editorId));
}

/**
 * Parses the JSON editor value and returns both the parsed object and raw text.
 * @returns An object with the parsed value (or null) and the raw text
 */
export function parseJsonEditorValue(): { value: Record<string, unknown> | null; text: string } {
    const jsonText = getEditorText("jsonEditor");
    if (!jsonText.trim()) {
        return { value: null, text: jsonText };
    }

    return { value: JSON.parse(jsonText) as Record<string, unknown>, text: jsonText };
}