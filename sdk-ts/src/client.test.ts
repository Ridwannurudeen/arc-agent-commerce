import { describe, it, expect } from 'vitest';
import { ArcCommerce } from './client.js';
import { CONTRACTS } from './constants.js';

describe('ArcCommerce.registerAgent', () => {
  it('throws without a private key', async () => {
    const sdk = new ArcCommerce();
    await expect(sdk.registerAgent()).rejects.toThrow(/Private key required/);
  });

  it('IDENTITY_REGISTRY is the Arc-native ERC-8004 address', () => {
    expect(CONTRACTS.IDENTITY_REGISTRY).toBe(
      '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    );
  });

  it('SDK exposes registerAgent method', () => {
    const sdk = new ArcCommerce();
    expect(typeof sdk.registerAgent).toBe('function');
  });
});
