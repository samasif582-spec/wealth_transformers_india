import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from './r2-storage.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import {
  ALLOWED_MIME_TYPES,
  MAX_TOTAL_ORG_QUOTA_BYTES,
  UPLOAD_PRESIGNED_TTL_SECONDS,
  DOWNLOAD_PRESIGNED_TTL_SECONDS,
} from './media.constants';
import { TemplateStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export interface MappedMediaAsset {
  id: string;
  r2ObjectKey: string;
  fileName: string;
  mimeType: string;
  fileType: string;
  fileSizeBytes: number;
  metaMediaId: string | null;
  uploadedByUserId: string;
  virusScanStatus: string;
  uploadConfirmedAt: Date | null;
  deletedAt: Date | null;
  r2PurgeAt: Date | null;
  createdAt: Date;
}

/**
 * Validates Cloudflare R2 presigned upload parameters.
 */
export function validateMediaUploadParams(params: {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  currentQuotaBytes: number;
}): { valid: boolean; error?: string } {
  const MAX_TOTAL_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
  const ALLOWED_MIMES: Record<string, number> = {
    'image/jpeg': 5 * 1024 * 1024, // 5MB
    'image/png': 5 * 1024 * 1024, // 5MB
    'application/pdf': 100 * 1024 * 1024, // 100MB
    'video/mp4': 16 * 1024 * 1024, // 16MB
  };

  const maxAllowedForMime = ALLOWED_MIMES[params.mimeType];
  if (!maxAllowedForMime) {
    return { valid: false, error: `Disallowed media type: ${params.mimeType}` };
  }

  if (params.fileSizeBytes > maxAllowedForMime) {
    return {
      valid: false,
      error: `File size ${params.fileSizeBytes} exceeds maximum allowed ${maxAllowedForMime} for ${params.mimeType}`,
    };
  }

  if (params.currentQuotaBytes + params.fileSizeBytes > MAX_TOTAL_QUOTA_BYTES) {
    return { valid: false, error: 'Storage quota exceeded: 10GB limit reached' };
  }

  return { valid: true };
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2StorageService: R2StorageService,
  ) {}

  /**
   * Helper to format BigInt fileSizeBytes for clean JSON serialization
   */
  private mapAsset(asset: any): MappedMediaAsset {
    return {
      ...asset,
      fileSizeBytes: Number(asset.fileSizeBytes),
    };
  }

  /**
   * Validates MIME type, file size per-type limits, and organization 10GB quota.
   */
  async validateUpload(dto: PresignedUploadDto): Promise<{
    fileType: any;
    currentUsage: number;
  }> {
    const mimeConfig = ALLOWED_MIME_TYPES[dto.mimeType];
    if (!mimeConfig) {
      throw new BadRequestException(
        `Disallowed media type: ${dto.mimeType}. Allowed types: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}`,
      );
    }

    if (dto.fileSize > mimeConfig.maxSizeBytes) {
      throw new BadRequestException(
        `File size ${dto.fileSize} exceeds maximum allowed ${mimeConfig.maxSizeBytes} for ${dto.mimeType}`,
      );
    }

    // Verify current cumulative organization storage quota
    const usageAggregate = await this.prisma.mediaAsset.aggregate({
      where: { deletedAt: null },
      _sum: { fileSizeBytes: true },
    });
    const currentUsage = Number(usageAggregate._sum.fileSizeBytes || 0n);

    if (currentUsage + dto.fileSize > MAX_TOTAL_ORG_QUOTA_BYTES) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          error: 'Payload Too Large',
          message: 'Storage quota exceeded: 10GB limit reached',
          currentQuotaBytes: currentUsage,
          requestedSizeBytes: dto.fileSize,
          maxQuotaBytes: MAX_TOTAL_ORG_QUOTA_BYTES,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    return { fileType: mimeConfig.fileType, currentUsage };
  }

  /**
   * Generates a presigned Cloudflare R2 upload URL (PutObject, 10 min TTL)
   * and creates the media asset tracking record in the database.
   */
  async createPresignedUpload(
    dto: PresignedUploadDto,
    userId = '00000000-0000-0000-0000-000000000000',
  ): Promise<{
    uploadUrl: string;
    assetId: string;
    objectKey: string;
    expiresIn: number;
  }> {
    const { fileType } = await this.validateUpload(dto);

    const assetId = uuidv4();
    const sanitizedFilename = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `assets/${assetId}/${sanitizedFilename}`;

    const uploadUrl = await this.r2StorageService.generatePresignedUploadUrl(
      objectKey,
      dto.mimeType,
      UPLOAD_PRESIGNED_TTL_SECONDS,
    );

    await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        r2ObjectKey: objectKey,
        fileName: dto.filename,
        mimeType: dto.mimeType,
        fileType,
        fileSizeBytes: BigInt(dto.fileSize),
        uploadedByUserId: userId,
        virusScanStatus: 'PENDING',
      },
    });

    this.logger.log(`Created presigned upload for asset ${assetId} (${dto.filename})`);

    return {
      uploadUrl,
      assetId,
      objectKey,
      expiresIn: UPLOAD_PRESIGNED_TTL_SECONDS,
    };
  }

  /**
   * Generates a 15-minute presigned GetObject URL for an active media asset.
   * Direct public R2 access is strictly denied.
   */
  async getPresignedDownload(id: string): Promise<{
    downloadUrl: string;
    expiresIn: number;
  }> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException(`Media asset ${id} not found or has been deleted`);
    }

    if (asset.virusScanStatus === 'INFECTED') {
      throw new BadRequestException('Media asset failed virus scanning and cannot be downloaded');
    }

    const downloadUrl = await this.r2StorageService.generatePresignedDownloadUrl(
      asset.r2ObjectKey,
      DOWNLOAD_PRESIGNED_TTL_SECONDS,
    );

    return {
      downloadUrl,
      expiresIn: DOWNLOAD_PRESIGNED_TTL_SECONDS,
    };
  }

  /**
   * Confirms client-side R2 upload completion.
   */
  async confirmUpload(id: string): Promise<MappedMediaAsset> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException(`Media asset ${id} not found`);
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        uploadConfirmedAt: new Date(),
        virusScanStatus: 'CLEAN',
      },
    });

    this.logger.log(`Confirmed upload for media asset ${id}`);
    return this.mapAsset(updated);
  }

  /**
   * Retrieves paginated media asset records.
   */
  async findAll(query: QueryMediaDto): Promise<{
    data: MappedMediaAsset[];
    total: number;
    page: number;
    limit: number;
    totalStorageBytes: number;
    quotaBytes: number;
  }> {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(query.fileType ? { fileType: query.fileType } : {}),
      ...(query.search
        ? { fileName: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [assets, total, quotaSum] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.aggregate({
        where: { deletedAt: null },
        _sum: { fileSizeBytes: true },
      }),
    ]);

    return {
      data: assets.map((a) => this.mapAsset(a)),
      total,
      page,
      limit,
      totalStorageBytes: Number(quotaSum._sum.fileSizeBytes || 0n),
      quotaBytes: MAX_TOTAL_ORG_QUOTA_BYTES,
    };
  }

  /**
   * Retrieves single media asset metadata.
   */
  async findOne(id: string): Promise<MappedMediaAsset> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException(`Media asset ${id} not found`);
    }

    return this.mapAsset(asset);
  }

  /**
   * Soft-deletes a media asset with dependent template check and sets 30-day purge date.
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, deletedAt: null },
    });

    if (!asset) {
      throw new NotFoundException(`Media asset ${id} not found`);
    }

    // Check if referenced by any active TemplateVersion
    const dependentVersions = await this.prisma.templateVersion.findMany({
      where: {
        headerMediaId: id,
        status: { in: [TemplateStatus.DRAFT, TemplateStatus.PENDING_APPROVAL, TemplateStatus.APPROVED] },
      },
      include: { template: true },
    });

    if (dependentVersions.length > 0) {
      const dependents = dependentVersions
        .map((v) => `${v.template.name} (v${v.versionNumber}) [${v.templateId}]`)
        .join(', ');
      throw new BadRequestException(
        `Cannot delete media asset because it is referenced by active template(s): ${dependents}`,
      );
    }

    const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days retention

    await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        r2PurgeAt: purgeDate,
      },
    });

    this.logger.log(`Soft-deleted media asset ${id}, scheduled purge for ${purgeDate.toISOString()}`);

    return {
      success: true,
      message: 'Media asset soft-deleted successfully. Scheduled for permanent purge in 30 days.',
    };
  }

  /**
   * Returns organization storage quota metrics.
   */
  async getStorageQuota(): Promise<{
    usedBytes: number;
    totalQuotaBytes: number;
    availableBytes: number;
    usedPercentage: number;
  }> {
    const usageAggregate = await this.prisma.mediaAsset.aggregate({
      where: { deletedAt: null },
      _sum: { fileSizeBytes: true },
    });

    const usedBytes = Number(usageAggregate._sum.fileSizeBytes || 0n);
    const availableBytes = Math.max(0, MAX_TOTAL_ORG_QUOTA_BYTES - usedBytes);
    const usedPercentage = Number(((usedBytes / MAX_TOTAL_ORG_QUOTA_BYTES) * 100).toFixed(2));

    return {
      usedBytes,
      totalQuotaBytes: MAX_TOTAL_ORG_QUOTA_BYTES,
      availableBytes,
      usedPercentage,
    };
  }
}
