import { MediaFileType } from '@prisma/client';

export interface MimeTypeConfig {
  fileType: MediaFileType;
  maxSizeBytes: number;
  extensions: string[];
}

export const ALLOWED_MIME_TYPES: Record<string, MimeTypeConfig> = {
  'image/jpeg': {
    fileType: MediaFileType.JPEG,
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    extensions: ['.jpg', '.jpeg'],
  },
  'image/png': {
    fileType: MediaFileType.PNG,
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    extensions: ['.png'],
  },
  'application/pdf': {
    fileType: MediaFileType.PDF,
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB
    extensions: ['.pdf'],
  },
  'video/mp4': {
    fileType: MediaFileType.MP4,
    maxSizeBytes: 16 * 1024 * 1024, // 16 MB
    extensions: ['.mp4'],
  },
};

export const MAX_TOTAL_ORG_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB (10,737,418,240 bytes)
export const UPLOAD_PRESIGNED_TTL_SECONDS = 600; // 10 minutes
export const DOWNLOAD_PRESIGNED_TTL_SECONDS = 900; // 15 minutes
