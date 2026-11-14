export function calledName(insertText: string): string {
  return insertText.slice(0, insertText.indexOf("("));
}
