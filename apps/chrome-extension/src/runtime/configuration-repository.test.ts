import { describe, expect, it, vi } from 'vitest';

import { createConfigurationRepository } from './configuration-repository.ts';

describe('createConfigurationRepository', () => {
  it('creates and persists the baseline direct, system, and automatic profiles', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createConfigurationRepository({ read, write });

    const document = await repository.load();

    expect(document.activeProfileId).toBe('direct');
    expect(document.profiles.map((profile) => profile.kind)).toEqual([
      'direct',
      'system',
      'auto-switch'
    ]);
    expect(write).toHaveBeenCalledWith(document);
  });

  it('does not overwrite a stored document that fails validation', async () => {
    const read = vi.fn().mockResolvedValue({ schemaVersion: 1 });
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createConfigurationRepository({ read, write });

    await expect(repository.load()).rejects.toThrow('Stored configuration is invalid');
    expect(write).not.toHaveBeenCalled();
  });
});
