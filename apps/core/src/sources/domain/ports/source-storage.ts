// Storage-specific on purpose: bucket, key, presigning and versions.
export interface SourceStorage {
  readonly bucket: string;
  presignUpload(
    key: string,
    contentType: string,
    size: number,
    expiresInSeconds: number,
  ): Promise<string>;
  deleteAllVersions(key: string): Promise<void>;
  // Every object version whose key starts with the prefix (renditions of all versions).
  deleteAllVersionsUnder(prefix: string): Promise<void>;
  presignDownload(request: {
    key: string;
    // Omitted for renditions, whose key already names the original's version.
    versionId?: string;
    contentType: string;
    // Set for "download original"; inline viewing leaves it undefined.
    attachmentFilename?: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
