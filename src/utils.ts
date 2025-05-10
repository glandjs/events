export function generateUUID(): string {
  // (modern browsers and Node.js)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const getRandomValues = (buffer: Uint8Array): Uint8Array => {
    // (browsers)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      return crypto.getRandomValues(buffer);
    }

    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
  };

  const rnds = new Uint8Array(16);
  getRandomValues(rnds);

  // Set version (4) and variant bits (RFC4122)
  rnds[6] = (rnds[6] & 0x0f) | 0x40; // Version 4
  rnds[8] = (rnds[8] & 0x3f) | 0x80; // Variant 10

  const hexBytes = [];
  for (let i = 0; i < rnds.length; i++) {
    const hex = rnds[i].toString(16).padStart(2, '0');
    // @ts-ignore
    hexBytes.push(hex);
  }

  return [hexBytes.slice(0, 4).join(''), hexBytes.slice(4, 6).join(''), hexBytes.slice(6, 8).join(''), hexBytes.slice(8, 10).join(''), hexBytes.slice(10, 16).join('')].join('-');
}
