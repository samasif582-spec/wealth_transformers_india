import { ClientsController } from '../clients.controller';
import { ClientsService } from '../clients.service';
import { UserRole } from '@prisma/client';

describe('ClientsController', () => {
  let controller: ClientsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 1 }),
      findOne: jest.fn().mockResolvedValue({ id: 'client-1' }),
      create: jest.fn().mockResolvedValue({ id: 'client-1' }),
      update: jest.fn().mockResolvedValue({ id: 'client-1' }),
      softDelete: jest.fn().mockResolvedValue({ id: 'client-1' }),
      restore: jest.fn().mockResolvedValue({ id: 'client-1' }),
      eraseClient: jest.fn().mockResolvedValue({ success: true, clientId: 'client-1' }),
      import: jest.fn().mockResolvedValue({ success: true, imported: 10 }),
      export: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      getStats: jest.fn().mockResolvedValue({ byConsent: [], byCategory: [] }),
    };

    controller = new ClientsController(mockService as ClientsService);
  });

  it('findAll should delegate to clientsService.findAll', async () => {
    await controller.findAll({ page: 1, limit: 20 });
    expect(mockService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('create should pass dto and actor ID to service', async () => {
    const actor: any = { sub: 'actor-1', role: UserRole.Admin };
    await controller.create({ fullName: 'Test', whatsappNumber: '+919999900000' }, actor);
    expect(mockService.create).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Test' }),
      'actor-1',
    );
  });

  it('softDelete should delegate to service', async () => {
    const actor: any = { sub: 'actor-1', role: UserRole.Admin };
    await controller.softDelete('client-1', actor);
    expect(mockService.softDelete).toHaveBeenCalledWith('client-1', 'actor-1');
  });

  it('restore should delegate to service', async () => {
    const actor: any = { sub: 'super-admin-1', role: UserRole.Super_Admin };
    await controller.restore('client-1', actor);
    expect(mockService.restore).toHaveBeenCalledWith('client-1', 'super-admin-1');
  });

  it('eraseClient should delegate to service with erasure request', async () => {
    const actor: any = { sub: 'admin-1', role: UserRole.Admin };
    const dto = { confirmed: true, reason: 'Right-to-erasure confirmed' };
    await controller.eraseClient('client-1', dto, actor);
    expect(mockService.eraseClient).toHaveBeenCalledWith('client-1', dto, 'admin-1');
  });

  it('importClients should forward file to service', async () => {
    const actor: any = { sub: 'marketing-1', role: UserRole.Marketing_Employee };
    const mockFile: any = { buffer: Buffer.from('test'), originalname: 'clients.csv' };
    await controller.importClients(mockFile, actor);
    expect(mockService.import).toHaveBeenCalledWith(mockFile, 'marketing-1');
  });
});
