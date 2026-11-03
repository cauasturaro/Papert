// Mirrors Core's limits so learners get immediate feedback; Core re-validates.
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const MAX_WORKSPACE_SOURCES = 20;
export const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx", ".md"];

export function rejectionReason(file: { name: string; size: number }) {
  const name = file.name.toLowerCase();
  const accepted = ACCEPTED_EXTENSIONS.some((extension) =>
    name.endsWith(extension),
  );

  if (!accepted) {
    return "Upload a PDF, DOC, DOCX or MD file.";
  }

  if (file.size === 0) {
    return "The file is empty.";
  }

  if (file.size > MAX_SOURCE_BYTES) {
    return "Files must be 15 MB or smaller.";
  }

  return null;
}
