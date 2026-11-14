import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SourceStorage } from '../domain/ports/source-storage.js';

function client(endpoint: string | undefined) {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    endpoint: endpoint || undefined,
    // Emulators and local endpoints need path-style URLs; AWS accepts both.
    forcePathStyle: Boolean(endpoint),
    maxAttempts: 3,
  });
}

export class S3SourceStorage implements SourceStorage {
  readonly bucket = process.env.SOURCES_BUCKET ?? 'papert-sources';

  private readonly s3 = client(process.env.AWS_ENDPOINT_URL);

  // Locally the browser reaches S3 through a different host than Core does.
  private readonly signer = client(
    process.env.SOURCES_PUBLIC_S3_ENDPOINT || process.env.AWS_ENDPOINT_URL,
  );

  async presignUpload(
    key: string,
    contentType: string,
    size: number,
    expiresInSeconds: number,
  ) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });

    // Signing Content-Type and Content-Length binds the URL to the declared file.
    return getSignedUrl(this.signer, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  async presignDownload(request: {
    key: string;
    versionId?: string;
    contentType: string;
    attachmentFilename?: string;
    expiresInSeconds: number;
  }) {
    const disposition = request.attachmentFilename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(request.attachmentFilename)}`
      : 'inline';

    // Pinning the version keeps the link on the exact bytes Core authorized.
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: request.key,
      VersionId: request.versionId,
      ResponseContentType: request.contentType,
      ResponseContentDisposition: disposition,
    });

    return getSignedUrl(this.signer, command, {
      expiresIn: request.expiresInSeconds,
    });
  }

  async deleteAllVersions(key: string) {
    await this.deleteVersions(key, (candidate) => candidate === key);
  }

  async deleteAllVersionsUnder(prefix: string) {
    await this.deleteVersions(prefix, (candidate) =>
      candidate.startsWith(prefix),
    );
  }

  private async deleteVersions(
    prefix: string,
    matches: (key: string) => boolean,
  ) {
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;

    do {
      const page = await this.s3.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionMarker,
        }),
      );

      const versions = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter((item) => item.Key && matches(item.Key) && item.VersionId)
        .map((item) => ({ Key: item.Key, VersionId: item.VersionId }));

      if (versions.length > 0) {
        const result = await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: versions, Quiet: true },
          }),
        );

        if (result.Errors?.length) {
          throw new Error('Some source object versions were not deleted.');
        }
      }

      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
    } while (keyMarker);
  }
}
