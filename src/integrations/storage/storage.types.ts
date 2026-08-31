export type StoredObject = {
  key: string;
  url: string;
  bucket?: string;
};

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType?: string;
};

export interface ObjectStoragePort {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getPresignedUrl?(key: string, expiresInSeconds?: number): Promise<string>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
