/**
 * Unit tests for email processor state transitions.
 * We mock the Prisma client and Resend provider to verify:
 * - disabled → FAILED (not SENT)
 * - success → SENT with providerMessageId
 * - provider fail → FAILED + nextAttemptAt
 * - max attempts → DEAD
 */

jest.mock('../providers/email-resend', () => ({
  sendEmailResend: jest.fn(),
}));

jest.mock('../notify-config', () => ({
  notifyConfig: {
    emailEnabled: true,
    maxAttempts: 3,
    retryBaseSeconds: 60,
    retryMaxSeconds: 3600,
    lockSeconds: 60,
  },
  computeNextAttemptAt: jest.fn(() => new Date(Date.now() + 60_000)),
}));

import { processNotifyEmail } from '../processors/notify-email.processor';
import { sendEmailResend } from '../providers/email-resend';
import { notifyConfig } from '../notify-config';

const mockedSend = sendEmailResend as jest.MockedFunction<typeof sendEmailResend>;

function makePrisma(dispatch: any) {
  return {
    notificationDispatch: {
      findFirst: jest.fn().mockResolvedValue(dispatch),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ email: 'test@test.com' }),
    },
  } as any;
}

function makeDispatch(overrides: Partial<any> = {}) {
  return {
    id: 'dispatch-1',
    organizationId: 'org-1',
    channel: 'EMAIL',
    state: 'PENDING',
    attempts: 0,
    maxAttempts: 3,
    to: 'user@test.com',
    notification: {
      title: 'Test notification',
      body: 'Test body',
      userId: 'user-1',
      metaJson: {},
    },
    ...overrides,
  };
}

describe('processNotifyEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips if dispatchId is missing', async () => {
    const prisma = makePrisma(null);
    await processNotifyEmail(prisma, { organizationId: 'org-1' });
    expect(prisma.notificationDispatch.findFirst).not.toHaveBeenCalled();
  });

  it('skips if dispatch not found', async () => {
    const prisma = makePrisma(null);
    await processNotifyEmail(prisma, { organizationId: 'org-1', dispatchId: 'x' });
    expect(prisma.notificationDispatch.update).not.toHaveBeenCalled();
  });

  it('skips if dispatch already SENT', async () => {
    const prisma = makePrisma(makeDispatch({ state: 'SENT' }));
    await processNotifyEmail(prisma, { organizationId: 'org-1', dispatchId: 'dispatch-1' });
    expect(prisma.notificationDispatch.update).not.toHaveBeenCalled();
  });

  it('marks FAILED (not SENT) when email is disabled', async () => {
    (notifyConfig as any).emailEnabled = false;
    const dispatch = makeDispatch();
    const prisma = makePrisma(dispatch);
    await processNotifyEmail(prisma, { organizationId: 'org-1', dispatchId: 'dispatch-1' });

    const calls = prisma.notificationDispatch.update.mock.calls;
    // First call: SENDING lock
    expect(calls[0][0].data.state).toBe('SENDING');
    // Second call: FAILED (not SENT!)
    expect(calls[1][0].data.state).toBe('FAILED');
    expect(calls[1][0].data.lastErrorCode).toBe('EMAIL_DISABLED');
    expect(mockedSend).not.toHaveBeenCalled();
    (notifyConfig as any).emailEnabled = true;
  });

  it('marks SENT on provider success with providerMessageId', async () => {
    mockedSend.mockResolvedValue({ providerMessageId: 'msg-123' });
    const dispatch = makeDispatch();
    const prisma = makePrisma(dispatch);
    await processNotifyEmail(prisma, { organizationId: 'org-1', dispatchId: 'dispatch-1' });

    const calls = prisma.notificationDispatch.update.mock.calls;
    expect(calls[0][0].data.state).toBe('SENDING');
    expect(calls[1][0].data.state).toBe('SENT');
    expect(calls[1][0].data.providerMessageId).toBe('msg-123');
    expect(calls[1][0].data.sentAt).toBeInstanceOf(Date);
  });

  it('marks FAILED on provider error with nextAttemptAt', async () => {
    mockedSend.mockRejectedValue(Object.assign(new Error('rate limit'), { code: 'RESEND_429' }));
    const dispatch = makeDispatch({ attempts: 0 });
    const prisma = makePrisma(dispatch);
    await processNotifyEmail(prisma, { organizationId: 'org-1', dispatchId: 'dispatch-1' });

    const calls = prisma.notificationDispatch.update.mock.calls;
    expect(calls[1][0].data.state).toBe('FAILED');
    expect(calls[1][0].data.lastErrorCode).toBe('RESEND_429');
    expect(calls[1][0].data.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('marks DEAD when attempts reach maxAttempts', async () => {
    mockedSend.mockRejectedValue(new Error('fail'));
    const dispatch = makeDispatch({ attempts: 2, maxAttempts: 3 });
    const prisma = makePrisma(dispatch);
    await processNotifyEmail(prisma, { organizationId: 'org-1', dispatchId: 'dispatch-1' });

    const calls = prisma.notificationDispatch.update.mock.calls;
    // attempts was 2, +1 = 3, >= maxAttempts 3 → DEAD
    expect(calls[1][0].data.state).toBe('DEAD');
    expect(calls[1][0].data.nextAttemptAt).toBeNull();
  });
});
