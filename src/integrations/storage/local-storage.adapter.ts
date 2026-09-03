import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, extname, join } from 'path';
import {
  GetObjectOutput,
  ObjectStoragePort,
  PutObjectInput,
  StoredObject,
} from './storage.types';

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

@Injectable()
export class LocalStorageAdapter implements ObjectStoragePort {
  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const absolute = join(process.cwd(), 'uploads', input.key);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, input.body);
    return {
      key: input.key,
      url: `file://${absolute.replace(/\\/g, '/')}`,
    };
  }

  async getObject(key: string): Promise<GetObjectOutput> {
    const body = await readFile(join(process.cwd(), 'uploads', key));
    const contentType =
      CONTENT_TYPES_BY_EXTENSION[extname(key).toLowerCase()] ??
      'application/octet-stream';
    return { body, contentType };
  }
}
