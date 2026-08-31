import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  ObjectStoragePort,
  PutObjectInput,
  StoredObject,
} from './storage.types';

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
}
