import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ObjectStoragePort,
  PutObjectInput,
  StoredObject,
} from './storage.types';

@Injectable()
export class S3StorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;

  constructor(config: ConfigService) {
    const region = config.get<string>('storage.s3.region') ?? 'ap-south-1';
    const endpoint = config.get<string>('storage.s3.endpoint') || undefined;
    this.bucket = config.get<string>('storage.s3.bucket') ?? '';
    this.publicBaseUrl =
      config.get<string>('storage.s3.publicBaseUrl') || null;
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: config.get<boolean>('storage.s3.forcePathStyle') === true,
      credentials: {
        accessKeyId: config.get<string>('storage.s3.accessKeyId') ?? '',
        secretAccessKey: config.get<string>('storage.s3.secretAccessKey') ?? '',
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType ?? 'application/octet-stream',
      }),
    );
    const url = this.publicBaseUrl
      ? `${this.publicBaseUrl.replace(/\/$/, '')}/${input.key}`
      : `s3://${this.bucket}/${input.key}`;
    return {
      key: input.key,
      url,
      bucket: this.bucket,
    };
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
