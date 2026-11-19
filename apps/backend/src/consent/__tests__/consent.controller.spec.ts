import { ConsentController } from '../consent.controller';
import { ConsentService } from '../consent.service';
import { ConsentStatus, UserRole } from '@prisma/client';

describe('ConsentController', () => {
  let controller: ConsentController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      recordManualConsent: jest.fn().mockResolvedValue({ id: 'consent-1' }),
      optIn: jest.fn().mockResolvedValue({ id: 'consent-1' }),
      optOut: jest.fn().mockResolvedValue({ id: 'consent-1' }),
      handleInboundOptOut: jest.fn().mockResolvedValue({ success: true }),
      getConsentHistory: jest.fn().mockResolvedValue([]),
      exportRegister: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
    };

    controller = new ConsentController(mockService as ConsentService);
  });

  it('recordConsent should forward payload and actor sub', async () => {
    const actor: any = { sub: 'operator-1', role: UserRole.Operator };
    const dto = {
      clientId: 'client-1',
      status: ConsentStatus.OPTED_IN,
      reason: 'Manual opt-in',
    };
    await controller.recordConsent(dto as any, actor);
    expect(mockService.recordManualConsent).toHaveBeenCalledWith(dto, 'operator-1');
  });

  it('optIn should forward clientId and reason', async () => {
    const actor: any = { sub: 'operator-1', role: UserRole.Operator };
    const dto = {
      clientId: 'client-1',
      reason: 'Physical KYC form signed',
    };
    await controller.optIn(dto as any, actor);
    expect(mockService.optIn).toHaveBeenCalledWith(
      'client-1',
      'Physical KYC form signed',
      undefined,
      undefined,
      'operator-1',
    );
  });

  it('optOut should forward clientId and reason', async () => {
    const actor: any = { sub: 'operator-1', role: UserRole.Operator };
    const dto = {
      clientId: 'client-1',
      reason: 'Client requested opt-out',
    };
    await controller.optOut(dto as any, actor);
    expect(mockService.optOut).toHaveBeenCalledWith(
      'client-1',
      'Client requested opt-out',
      undefined,
      'operator-1',
    );
  });

  it('handleInbound should delegate to handleInboundOptOut', async () => {
    const dto = { clientId: 'client-1', keyword: 'STOP' };
    await controller.handleInbound(dto as any);
    expect(mockService.handleInboundOptOut).toHaveBeenCalledWith(dto);
  });

  it('getHistory should retrieve history for clientId', async () => {
    await controller.getHistory('client-1');
    expect(mockService.getConsentHistory).toHaveBeenCalledWith('client-1');
  });
});
