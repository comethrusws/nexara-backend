import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { OBJECT_STORAGE } from './storage.types';

@Module({
  providers: [
    LocalStorageAdapter,
    S3StorageAdapter,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService, LocalStorageAdapter, S3StorageAdapter],
      useFactory: (
        config: ConfigService,
        local: LocalStorageAdapter,
        s3: S3StorageAdapter,
      ) => {
        const driver = (config.get<string>('storage.driver') ?? 'local').toLowerCase();
        if (driver === 's3') {
          const bucket = config.get<string>('storage.s3.bucket');
          if (!bucket) {
            throw new Error(
              'STORAGE_DRIVER=s3 requires S3_BUCKET (and AWS credentials) to be set',
            );
          }
          return s3;
        }
        return local;
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
