import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { MediaService } from '../media.service';
import { R2StorageService } from '../r2-storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaFileType, TemplateStatus } from '@prisma/client';
import { MAX_TOTAL_ORG_QUOTA_BYTES } from '../media.constants';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: PrismaService;
  let r2Storage: R2StorageService;

  const mockPrismaService = {
    mediaAsset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    templateVersion: {
      findMany: jest.fn(),
    },
  };

  const mockR2StorageService = {
    generatePresignedUploadUrl: jest.fn(),
    generatePresignedDownloadUrl: jest.fn(),
    deleteObject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: R2StorageService, useValue: mockR2StorageService },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
    prisma = module.get<PrismaService>(PrismaService);
    r2Storage = module.get<R2StorageService>(R2StorageService);

    jest.clearAllMocks();
  });

  describe('Upload Validation & Quota Enforcement', () => {
    it('should validate allowed MIME types (JPEG, PNG, PDF, MP4)', async () => {
      mockPrismaService.mediaAsset.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: 0n },
      });

      const allowed = [
        { filename: 'chart.png', mimeType: 'image/png', fileSize: 1024 * 500 },
        { filename: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 500 },
        { filename: 'report.pdf', mimeType: 'application/pdf', fileSize: 1024 * 1024 * 10 },
        { filename: 'promo.mp4', mimeType: 'video/mp4', fileSize: 1024 * 1024 * 15 },
      ];

      for (const item of allowed) {
        const result = await service.validateUpload(item);
        expect(result.currentUsage).toBe(0);
      }
    });

    it('should reject disallowed MIME types with 400 Bad Request', async () => {
      const disallowed = [
        { filename: 'virus.exe', mimeType: 'application/x-msdownload', fileSize: 1024 },
        { filename: 'script.sh', mimeType: 'text/x-shellscript', fileSize: 1024 },
        { filename: 'notes.txt', mimeType: 'text/plain', fileSize: 1024 },
      ];

      for (const item of disallowed) {
        await expect(service.validateUpload(item)).rejects.toThrow(BadRequestException);
      }
    });

    it('should reject files exceeding per-type size limit with 400 Bad Request', async () => {
      mockPrismaService.mediaAsset.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: 0n },
      });

      // Image > 5MB
      await expect(
        service.validateUpload({
          filename: 'huge.jpg',
          mimeType: 'image/jpeg',
          fileSize: 6 * 1024 * 1024,
        }),
      ).rejects.toThrow(BadRequestException);

      // Video > 16MB
      await expect(
        service.validateUpload({
          filename: 'movie.mp4',
          mimeType: 'video/mp4',
          fileSize: 20 * 1024 * 1024,
        }),
      ).rejects.toThrow(BadRequestException);

      // PDF > 100MB
      await expect(
        service.validateUpload({
          filename: 'big_doc.pdf',
          mimeType: 'application/pdf',
          fileSize: 105 * 1024 * 1024,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should enforce 10GB total organization quota and throw HTTP 413 Payload Too Large when exceeded', async () => {
      // Current usage: 9.98 GB
      const currentBytes = BigInt(Math.floor(9.98 * 1024 * 1024 * 1024));
      mockPrismaService.mediaAsset.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: currentBytes },
      });

      // Attempting to upload 50MB -> exceeds 10GB limit
      const oversizedUpload = {
        filename: 'heavy_report.pdf',
        mimeType: 'application/pdf',
        fileSize: 50 * 1024 * 1024,
      };

      try {
        await service.validateUpload(oversizedUpload);
        fail('Should have thrown HTTP 413');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(err.message).toMatch(/Storage quota exceeded/i);
      }
    });
  });

  describe('Presigned Upload Generation', () => {
    it('should generate presigned PutObject URL valid for 10 minutes (600s)', async () => {
      mockPrismaService.mediaAsset.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: 0n },
      });

      mockR2StorageService.generatePresignedUploadUrl.mockResolvedValue(
        'https://r2.wealthtrade.in/assets/asset-1/chart.png?X-Amz-Expires=600',
      );

      mockPrismaService.mediaAsset.create.mockResolvedValue({
        id: 'mock-uuid',
        fileName: 'chart.png',
      });

      const res = await service.createPresignedUpload({
        filename: 'chart.png',
        mimeType: 'image/png',
        fileSize: 1024 * 200,
      });

      expect(res.expiresIn).toBe(600);
      expect(res.uploadUrl).toContain('X-Amz-Expires=600');
      expect(mockR2StorageService.generatePresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining('chart.png'),
        'image/png',
        600,
      );
      expect(mockPrismaService.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fileName: 'chart.png',
            mimeType: 'image/png',
            fileType: MediaFileType.PNG,
            virusScanStatus: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('Presigned Download Generation', () => {
    it('should generate presigned GetObject URL valid for 15 minutes (900s)', async () => {
      mockPrismaService.mediaAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        r2ObjectKey: 'assets/asset-1/research.pdf',
        deletedAt: null,
        virusScanStatus: 'CLEAN',
      });

      mockR2StorageService.generatePresignedDownloadUrl.mockResolvedValue(
        'https://r2.wealthtrade.in/assets/asset-1/research.pdf?X-Amz-Expires=900',
      );

      const res = await service.getPresignedDownload('asset-1');

      expect(res.expiresIn).toBe(900);
      expect(res.downloadUrl).toContain('X-Amz-Expires=900');
      expect(mockR2StorageService.generatePresignedDownloadUrl).toHaveBeenCalledWith(
        'assets/asset-1/research.pdf',
        900,
      );
    });

    it('should throw 404 for non-existent or soft-deleted asset', async () => {
      mockPrismaService.mediaAsset.findFirst.mockResolvedValue(null);

      await expect(service.getPresignedDownload('ghost-asset')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Confirm Upload & Deletion', () => {
    it('should confirm upload and mark virusScanStatus as CLEAN', async () => {
      mockPrismaService.mediaAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        fileSizeBytes: 1024n,
        deletedAt: null,
      });

      mockPrismaService.mediaAsset.update.mockResolvedValue({
        id: 'asset-1',
        fileSizeBytes: 1024n,
        uploadConfirmedAt: new Date(),
        virusScanStatus: 'CLEAN',
      });

      const confirmed = await service.confirmUpload('asset-1');
      expect(confirmed.virusScanStatus).toBe('CLEAN');
      expect(confirmed.fileSizeBytes).toBe(1024);
    });

    it('should prevent deletion of media asset referenced by active template', async () => {
      mockPrismaService.mediaAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        deletedAt: null,
      });

      mockPrismaService.templateVersion.findMany.mockResolvedValue([
        {
          id: 'ver-1',
          versionNumber: 1,
          templateId: 'tmpl-1',
          template: { name: 'market_update' },
        },
      ]);

      await expect(service.delete('asset-1')).rejects.toThrow(BadRequestException);
    });

    it('should soft-delete asset and set 30-day purge timestamp if unreferenced', async () => {
      mockPrismaService.mediaAsset.findFirst.mockResolvedValue({
        id: 'asset-1',
        deletedAt: null,
      });

      mockPrismaService.templateVersion.findMany.mockResolvedValue([]);
      mockPrismaService.mediaAsset.update.mockResolvedValue({});

      const res = await service.delete('asset-1');
      expect(res.success).toBe(true);
      expect(mockPrismaService.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: {
          deletedAt: expect.any(Date),
          r2PurgeAt: expect.any(Date),
        },
      });
    });
  });

  describe('Storage Quota Metrics', () => {
    it('should calculate accurate usage, limit, and available storage', async () => {
      const used = 2n * 1024n * 1024n * 1024n; // 2 GB
      mockPrismaService.mediaAsset.aggregate.mockResolvedValue({
        _sum: { fileSizeBytes: used },
      });

      const quota = await service.getStorageQuota();
      expect(quota.usedBytes).toBe(Number(used));
      expect(quota.totalQuotaBytes).toBe(MAX_TOTAL_ORG_QUOTA_BYTES);
      expect(quota.availableBytes).toBe(MAX_TOTAL_ORG_QUOTA_BYTES - Number(used));
      expect(quota.usedPercentage).toBe(20);
    });
  });
});
