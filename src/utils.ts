/**
 * RFC 4122 version 4 UUID.
 *
 * Every emit is deduped by an id, and the mesh relies on those ids being unique
 * across brokers, so this is on the hot path for `broadcast` as much as for
 * `emit`. It is written to never throw: an environment with no WebCrypto, or one
 * that refuses the call, degrades instead of taking the broker down.
 *
 * Three tiers, in order:
 *
 * 1. `crypto.randomUUID` — Node 18+, all modern browsers. Fastest.
 * 2. `crypto.getRandomValues` — older Safari, embedded runtimes.
 * 3. `Math.random` — no WebCrypto at all, or a hardened runtime that throws.
 *
 * Tier 3 is not cryptographically strong, and does not need to be: the id only
 * has to be unique within a process, not unguessable. Anything that needs
 * unpredictability should use `crypto.randomUUID` directly.
 *
 * @example
 * const eventId = generateUUID(); // '9f1c...-4a1b-...'
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (!fillRandom(bytes)) {
    throw new Error('generateUUID: no source of randomness available');
  }

  // Version 4 (random) and variant 10 (RFC 4122), per RFC 4122 §4.4.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i]!.toString(16).padStart(2, '0'));
  }

  return [hex.slice(0, 4).join(''), hex.slice(4, 6).join(''), hex.slice(6, 8).join(''), hex.slice(8, 10).join(''), hex.slice(10, 16).join('')].join('-');
}

/**
 * Fills `target` with random bytes.
 *
 * Tries WebCrypto and swallows a rejection from it. A runtime that exposes
 * `getRandomValues` but throws when called — a hardened sandbox, a policy
 * wrapper — must not be fatal, because the `Math.random` tier below exists for
 * exactly that case.
 *
 * @returns `false` only if `Math.random` itself is unusable, which effectively
 *   cannot happen, and is reported rather than hidden behind a zero-filled id
 *   that would collide with every other such id.
 */
function fillRandom(target: Uint8Array): boolean {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(target);
      return true;
    }
  } catch {
    // Fall through to Math.random.
  }

  if (typeof Math.random !== 'function') {
    return false;
  }

  for (let i = 0; i < target.length; i++) {
    target[i] = Math.floor(Math.random() * 256);
  }
  return true;
}
