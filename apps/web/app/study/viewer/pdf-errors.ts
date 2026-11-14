export function isPdfCancellation(failure: unknown) {
  return failure instanceof Error && (
    failure.name === "RenderingCancelledException" ||
    failure.name === "AbortException"
  );
}
