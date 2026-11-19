import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly endpointUrl: string;

  constructor(private readonly config: ConfigService) {
    this.endpointUrl =
      this.config.get<string>('R2_ENDPOINT_URL') ||
      'https://dev.r2.cloudflarestorage.com';
    this.bucketName =
      this.config.get<string>('R2_BUCKET_NAME') || 'wt-whatsapp-assets';
    const accessKeyId =
      this.config.get<string>('R2_ACCESS_KEY_ID') || 'dev_r2_key';
    const secretAccessKey =
      this.config.get<string>('R2_SECRET_ACCESS_KEY') || 'dev_r2_secret';

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.endpointUrl,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  /**
   * Generates a presigned PutObject URL valid for the specified duration (default: 600s / 10 min).
   */
  async generatePresignedUploadUrl(
    objectKey: string,
    mimeType: string,
    expiresIn = 600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: mimeType,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Generates a presigned GetObject URL valid for the specified duration (default: 900s / 15 min).
   * Direct public R2 access is strictly denied.
   */
  async generatePresignedDownloadUrl(
    objectKey: string,
    expiresIn = 900,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Deletes an object from the R2 storage bucket.
   */
  async deleteObject(objectKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      await this.s3Client.send(command);
    } catch (err) {
      this.logger.warn(`Failed to delete object ${objectKey} from R2: ${String(err)}`);
    }
  }
}
