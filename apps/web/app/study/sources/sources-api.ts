import { studyRequest } from "../study-api";

// Deleted sources are never listed by Core.
export type SourceStatus =
  "awaiting_upload" | "processing" | "ready" | "failed";

export type Source = {
  id: string;
  filename: string;
  format: "pdf" | "doc" | "docx" | "md";
  size: number;
  status: SourceStatus;
  error: { code: string; message: string } | null;
  chunkCount: number | null;
  pageCount: number | null;
  warnings: string[];
};

type Registration = {
  source: Source;
  upload: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
  };
};

export function sourcesPath(workspaceId: string) {
  return `workspaces/${workspaceId}/sources`;
}

export function listSources(workspaceId: string) {
  return studyRequest<Source[]>(sourcesPath(workspaceId));
}

export function registerSource(workspaceId: string, file: File) {
  const declaration = {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  };

  return studyRequest<Registration>(
    sourcesPath(workspaceId),
    "POST",
    declaration,
  );
}

export function deleteSource(workspaceId: string, sourceId: string) {
  // Core requires a JSON body on every mutation (origin/CSRF check).
  return studyRequest<void>(
    `${sourcesPath(workspaceId)}/${sourceId}`,
    "DELETE",
    {},
  );
}

/** Sends the bytes straight to storage; Papert's servers never receive them. */
export function uploadToStorage(
  registration: Registration,
  file: File,
  onProgress: (fraction: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open(registration.upload.method, registration.upload.url);

    for (const [name, value] of Object.entries(registration.upload.headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();

        return;
      }

      reject(new Error("The upload was rejected. Try again."));
    };

    request.onerror = () => {
      reject(new Error("The upload failed. Check your connection."));
    };

    request.send(file);
  });
}
