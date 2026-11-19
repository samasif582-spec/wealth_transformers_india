import { MediaController } from '../media.controller';
import { MediaService } from '../media.service';

describe('MediaController', () => {
  let controller: MediaController;
  let mockMediaService: any;

  beforeEach(() => {
    mockMediaService = {
      createPresignedUpload: jest.fn(),
      getPresignedDownload: jest.fn(),
      confirmUpload: jest.fn(),
      getStorageQuota: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    controller = new MediaController(mockMediaService as MediaService);
  });

  it('should create presigned upload', async () => {
    const dto = {
      filename: 'sample.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 1024,
    };

    mockMediaService.createPresignedUpload.mockResolvedValue({
      uploadUrl: 'https://r2.wealthtrade.in/upload?sig=abc',
      assetId: 'asset-1',
      objectKey: 'assets/asset-1/sample.pdf',
      expiresIn: 600,
    });

    const res = await controller.createPresignedUpload(dto, 'user-123');
    expect(res.assetId).toBe('asset-1');
    expect(mockMediaService.createPresignedUpload).toHaveBeenCalledWith(dto, 'user-123');
  });

  it('should get presigned download', async () => {
    mockMediaService.getPresignedDownload.mockResolvedValue({
      downloadUrl: 'https://r2.wealthtrade.in/download?sig=xyz',
      expiresIn: 900,
    });

    const res = await controller.getPresignedDownload('asset-1');
    expect(res.expiresIn).toBe(900);
    expect(mockMediaService.getPresignedDownload).toHaveBeenCalledWith('asset-1');
  });

  it('should confirm upload', async () => {
    mockMediaService.confirmUpload.mockResolvedValue({
      id: 'asset-1',
      virusScanStatus: 'CLEAN',
    });

    const res = await controller.confirmUpload('asset-1');
    expect(res.virusScanStatus).toBe('CLEAN');
    expect(mockMediaService.confirmUpload).toHaveBeenCalledWith('asset-1');
  });

  it('should get storage quota', async () => {
    mockMediaService.getStorageQuota.mockResolvedValue({
      usedBytes: 1000,
      totalQuotaBytes: 10737418240,
      availableBytes: 10737417240,
      usedPercentage: 0.01,
    });

    const res = await controller.getStorageQuota();
    expect(res.totalQuotaBytes).toBe(10737418240);
    expect(mockMediaService.getStorageQuota).toHaveBeenCalled();
  });

  it('should soft delete asset', async () => {
    mockMediaService.delete.mockResolvedValue({ success: true, message: 'Deleted' });

    const res = await controller.delete('asset-1');
    expect(res.success).toBe(true);
    expect(mockMediaService.delete).toHaveBeenCalledWith('asset-1');
  });
});
