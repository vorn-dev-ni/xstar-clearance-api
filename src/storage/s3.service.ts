import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';

/**
 * Thin wrapper over the AWS S3 client. Backs the presigned-URL upload flow: the
 * API signs short-lived URLs and the browser transfers bytes directly to S3, so
 * file data never passes through this server.
 */
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  readonly bucket: string;
  private readonly expiresIn: number;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.bucket = this.config.get('AWS_S3_BUCKET', { infer: true });
    this.expiresIn = this.config.get('S3_PRESIGN_EXPIRY', { infer: true });
    this.client = new S3Client({
      region: this.config.get('AWS_REGION', { infer: true }),
      credentials: {
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY', {
          infer: true,
        }),
      },
    });
  }

  /** Lifetime (seconds) of the presigned URLs this service issues. */
  get presignExpiry(): number {
    return this.expiresIn;
  }

  /**
   * A collision-free object key, namespaced by entity. Filenames are sanitized
   * to a safe subset so a hostile name can't escape the prefix.
   */
  buildKey(entityType: string | undefined, fileName: string): string {
    const folder = (entityType ?? 'misc')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    return `uploads/${folder || 'misc'}/${randomUUID()}-${safeName}`;
  }

  /** Presigned URL the client PUTs the file bytes to. */
  presignPut(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: this.expiresIn },
    );
  }

  /** Presigned download URL (the bucket is private). */
  presignGet(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.expiresIn },
    );
  }

  /** HEAD the object: existence plus the size S3 actually stored. */
  async headObject(key: string): Promise<{ exists: boolean; size?: number }> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { exists: true, size: head.ContentLength };
    } catch {
      return { exists: false };
    }
  }

  /** True if the object exists in the bucket (used to confirm an upload). */
  async objectExists(key: string): Promise<boolean> {
    return (await this.headObject(key)).exists;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
