import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { requireOpenPeriod } from '../middleware/requireOpenPeriod';
import { AppError } from '../utils/AppError';

vi.mock('../models/Period', () => ({
  Period: { findOne: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type MiddlewareFn = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Run middleware to completion and return whatever was passed to next(). */
function run(mw: MiddlewareFn, req: Partial<Request>): Promise<unknown> {
  return new Promise((resolve) => {
    mw(req as Request, {} as Response, (err?: unknown) => resolve(err));
  });
}

function makeReq(date?: string): Partial<Request> {
  return {
    tenantId: new Types.ObjectId() as unknown as Request['tenantId'],
    body: { invoiceDate: date },
  };
}

// Factory for the middleware under test — reads date from req.body.invoiceDate
const getDate = (req: Request) => (req as unknown as { body: { invoiceDate?: string } }).body.invoiceDate;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('requireOpenPeriod middleware', () => {
  beforeEach(async () => {
    const { Period } = await import('../models/Period');
    vi.mocked(Period.findOne).mockReset();
  });

  it('calls next() with no error when no date is provided', async () => {
    const mw = requireOpenPeriod(getDate);
    const err = await run(mw, makeReq(undefined));
    expect(err).toBeUndefined();
  });

  it('calls next() with no error for an open period', async () => {
    const { Period } = await import('../models/Period');
    vi.mocked(Period.findOne).mockResolvedValueOnce({
      status: 'open', name: 'Januar 2026',
    } as never);
    const mw = requireOpenPeriod(getDate);
    const err = await run(mw, makeReq('2026-01-15'));
    expect(err).toBeUndefined();
  });

  it('calls next() with AppError(422) for a locked period', async () => {
    const { Period } = await import('../models/Period');
    vi.mocked(Period.findOne).mockResolvedValueOnce({
      status: 'locked', name: 'Dezember 2025',
    } as never);
    const mw = requireOpenPeriod(getDate);
    const err = await run(mw, makeReq('2025-12-01'));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    expect((err as AppError).message).toContain('gesperrt');
  });

  it('calls next() with AppError(422) for a closed period', async () => {
    const { Period } = await import('../models/Period');
    vi.mocked(Period.findOne).mockResolvedValueOnce({
      status: 'closed', name: 'November 2025',
    } as never);
    const mw = requireOpenPeriod(getDate);
    const err = await run(mw, makeReq('2025-11-15'));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    expect((err as AppError).message).toContain('geschlossen');
  });

  it('calls next() with AppError(422) when no period exists for the given date', async () => {
    const { Period } = await import('../models/Period');
    vi.mocked(Period.findOne).mockResolvedValueOnce(null);
    const mw = requireOpenPeriod(getDate);
    const err = await run(mw, makeReq('2020-06-01'));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    expect((err as AppError).message).toContain('keine Buchungsperiode');
  });

  it('calls next() with AppError(400) for an invalid date string', async () => {
    const mw = requireOpenPeriod(getDate);
    const err = await run(mw, makeReq('not-a-date'));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(400);
  });

  it('attaches the period object to the request on success', async () => {
    const { Period } = await import('../models/Period');
    const fakePeriod = { status: 'open', name: 'März 2026' };
    vi.mocked(Period.findOne).mockResolvedValueOnce(fakePeriod as never);
    const mw = requireOpenPeriod(getDate);
    const req = makeReq('2026-03-10');
    await run(mw, req);
    expect((req as unknown as Record<string, unknown>).period).toBe(fakePeriod);
  });
});
