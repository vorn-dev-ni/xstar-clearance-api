import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';

/** Provides the S3 client wrapper to any feature that stores files. */
@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class StorageModule {}
