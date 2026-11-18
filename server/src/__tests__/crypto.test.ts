import { describe, it, expect } from 'vitest';
import { gobdHash, encryptField, decryptField, hashToken, compareTokenHash } from '../utils/crypto';

// ── gobdHash ─────────────────────────────────────────────────────────────────

describe('gobdHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = gobdHash({ a: 1 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always produces the same hash', () => {
    const obj = { tenantId: 'abc', entryNumber: 'BU-000001', amount: 1234 };
    expect(gobdHash(obj)).toBe(gobdHash(obj));
  });

  it('produces different hashes for different inputs', () => {
    expect(gobdHash({ a: 1 })).not.toBe(gobdHash({ a: 2 }));
  });

  it('is key-order independent (canonical JSON)', () => {
    const h1 = gobdHash({ a: 1, b: 2 });
    const h2 = gobdHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });
});

// ── encryptField / decryptField ───────────────────────────────────────────────

describe('encryptField / decryptField', () => {
  it('round-trips a plain string through encrypt → decrypt', () => {
    const plain = 'DE89 3704 0044 0532 0130 00';
    const encrypted = encryptField(plain);
    expect(decryptField(encrypted)).toBe(plain);
  });

  it('encrypted value starts with "enc:" prefix', () => {
    expect(encryptField('hello')).toMatch(/^enc:/);
  });

  it('each encryption of the same plaintext produces a DIFFERENT ciphertext (random IV)', () => {
    const a = encryptField('same');
    const b = encryptField('same');
    expect(a).not.toBe(b);
    // But both decrypt to the same plaintext
    expect(decryptField(a)).toBe('same');
    expect(decryptField(b)).toBe('same');
  });

  it('is idempotent — encrypting an already-encrypted value returns it unchanged', () => {
    const enc = encryptField('data');
    expect(encryptField(enc)).toBe(enc);
  });

  it('decryptField returns non-enc: strings as-is (passthrough)', () => {
    expect(decryptField('plaintext')).toBe('plaintext');
  });

  it('decryptField returns empty string as-is', () => {
    expect(decryptField('')).toBe('');
  });

  it('encryptField returns empty string as-is', () => {
    expect(encryptField('')).toBe('');
  });

  it('correctly decrypts special characters including umlauts', () => {
    const value = 'Müller-Straße 42, 10115 Köln — Steuer-Nr: 123/456/78901';
    expect(decryptField(encryptField(value))).toBe(value);
  });
});

// ── hashToken / compareTokenHash ─────────────────────────────────────────────

describe('hashToken / compareTokenHash', () => {
  it('produces a 64-char hex hash', () => {
    expect(hashToken('secret')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compareTokenHash returns true for matching token', () => {
    const token = 'my-refresh-token';
    const hash = hashToken(token);
    expect(compareTokenHash(token, hash)).toBe(true);
  });

  it('compareTokenHash returns false for non-matching token', () => {
    expect(compareTokenHash('wrong', hashToken('right'))).toBe(false);
  });
});
