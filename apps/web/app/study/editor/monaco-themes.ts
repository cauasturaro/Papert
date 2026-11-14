import type * as Monaco from "monaco-editor";
import type { ResolvedTheme } from "@/lib/theme";

type Palette = {
  base: "vs" | "vs-dark";
  background: string;
  foreground: string;
  muted: string;
  lineHighlight: string;
  selection: string;
  border: string;
  cursor: string;
  keyword: string;
  string: string;
  number: string;
  type: string;
  func: string;
  comment: string;
};

// Monaco needs literal hex colors, so these mirror styles/theme.css tokens
// (card, foreground, muted, ring) and the BlinkingEye chart palette.
const palettes: Record<ResolvedTheme, Palette> = {
  light: {
    base: "vs",
    background: "#ffffff",
    foreground: "#202024",
    muted: "#9a9aa3",
    lineHighlight: "#f4f4f5",
    selection: "#e8dff5",
    border: "#e4e4e7",
    cursor: "#85709f",
    keyword: "#7c58ad",
    string: "#246b46",
    number: "#c25f20",
    type: "#1e8489",
    func: "#3b6ec2",
    comment: "#62626b",
  },
  dark: {
    base: "vs-dark",
    background: "#19191c",
    foreground: "#f4f4f5",
    muted: "#6b6b75",
    lineHighlight: "#222225",
    selection: "#4a3d5c",
    border: "#34343a",
    cursor: "#baa4d2",
    keyword: "#c4a4f5",
    string: "#8bd5aa",
    number: "#f5b078",
    type: "#6cd4de",
    func: "#95bbf8",
    comment: "#8a8a94",
  },
};

export function monacoThemeName(theme: ResolvedTheme) {
  return `papert-${theme}`;
}

function strip(color: string) {
  return color.replace("#", "");
}

function themeData(palette: Palette): Monaco.editor.IStandaloneThemeData {
  return {
    base: palette.base,
    inherit: true,
    rules: [
      { token: "", foreground: strip(palette.foreground) },
      { token: "keyword", foreground: strip(palette.keyword) },
      { token: "string", foreground: strip(palette.string) },
      { token: "number", foreground: strip(palette.number) },
      { token: "type", foreground: strip(palette.type) },
      { token: "type.identifier", foreground: strip(palette.type) },
      { token: "identifier.function", foreground: strip(palette.func) },
      {
        token: "comment",
        foreground: strip(palette.comment),
        fontStyle: "italic",
      },
      { token: "delimiter", foreground: strip(palette.comment) },
    ],
    colors: {
      "editor.background": palette.background,
      "editor.foreground": palette.foreground,
      "editorLineNumber.foreground": palette.muted,
      "editorLineNumber.activeForeground": palette.foreground,
      "editor.lineHighlightBackground": palette.lineHighlight,
      "editor.lineHighlightBorder": palette.lineHighlight,
      "editor.selectionBackground": palette.selection,
      "editorCursor.foreground": palette.cursor,
      "editorIndentGuide.background1": palette.border,
      "editorWidget.background": palette.background,
      "editorWidget.border": palette.border,
      "scrollbarSlider.background": `${palette.muted}40`,
      "scrollbarSlider.hoverBackground": `${palette.muted}66`,
    },
  };
}

export function defineMonacoThemes(monaco: typeof Monaco) {
  for (const theme of Object.keys(palettes) as ResolvedTheme[]) {
    monaco.editor.defineTheme(
      monacoThemeName(theme),
      themeData(palettes[theme]),
    );
  }
}
