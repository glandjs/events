import { afterEach, describe, expect, it } from 'bun:test';
import { generateUUID } from '../../src/utils';

/**
 * `generateUUID` is the id that every emit is deduped by, so its failure modes
 * are not cosmetic: an id that repeats would drop events, and an id that throws
 * would break the mesh outright.
 *
 * The three tiers it falls back through are all reachable in real deployments —
 * Node 18+, browsers, and an environment with no WebCrypto at all — so each one
 * is exercised here by swapping `globalThis.crypto` out.
 */
describe('generateUUID', () => {
  const realCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true });
  });

  function setCrypto(value: unknown): void {
    Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  }

  /** Matches the 8-4-4-4-12 shape of a RFC 4122 UUID. */
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('produces a v4 UUID via crypto.randomUUID when available', () => {
    setCrypto({
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
      getRandomValues: () => {
        throw new Error('should not be reached');
      },
    });

    expect(generateUUID()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('produces a well-formed v4 UUID', () => {
    expect(generateUUID()).toMatch(UUID_V4);
  });

  it('does not repeat', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      ids.add(generateUUID());
    }
    expect(ids.size).toBe(10_000);
  });

  it('sets the version nibble to 4 and the variant bits to 10', () => {
    // The middle bits are constant by spec; the rest must still vary, which is
    // what proves the bytes are actually being randomised.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = generateUUID();
      expect(id[14]).toBe('4');
      expect('89ab').toContain(id[19] as string);
      seen.add(id);
    }
    expect(seen.size).toBe(200);
  });

  it('falls back to crypto.getRandomUUID when randomUUID is missing', () => {
    // Older Safari and some embedded runtimes expose getRandomValues without
    // randomUUID. That is the tier this exercises.
    setCrypto({
      getRandomValues: (buffer: Uint8Array) => {
        buffer.fill(0xab);
        return buffer;
      },
    });

    expect(generateUUID()).toBe('abababab-abab-4bab-abab-abababababab');
  });

  it('falls back to Math.random when there is no crypto at all', () => {
    // A non-browser sandbox with no WebCrypto. Nothing about the result can be
    // cryptographically strong here, and that is accepted: the id only has to
    // be unique within a process.
    setCrypto(undefined);
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      expect(generateUUID()).toMatch(UUID_V4);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('survives crypto.getRandomValues throwing, via the Math.random tier', () => {
    // Some hardened runtimes expose the WebCrypto shape but reject the call.
    setCrypto({
      getRandomValues: () => {
        throw new Error('blocked by policy');
      },
    });

    expect(generateUUID()).toMatch(UUID_V4);
  });

  it('throws rather than returning a colliding id when no source remains', () => {
    // The last tier. A zero-filled id would be well-formed but collide with
    // every other zero-filled id, and a broker that deduped on that would
    // silently drop events — so this reports instead of guessing.
    setCrypto(undefined);
    const originalRandom = Math.random;
    Math.random = undefined as unknown as typeof Math.random;
    try {
      expect(() => generateUUID()).toThrow('generateUUID: no source of randomness available');
    } finally {
      Math.random = originalRandom;
    }
  });
});
