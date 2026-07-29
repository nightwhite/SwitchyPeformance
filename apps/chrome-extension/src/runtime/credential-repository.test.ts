import { describe, expect, it, vi } from 'vitest';

import { createCredentialRepository } from './credential-repository.ts';

describe('createCredentialRepository', () => {
  it('clears the memory cache as well as the local credential store', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createCredentialRepository({
      read: vi
        .fn()
        .mockResolvedValue([{ id: 'credential-a', password: 'secret', username: 'user' }]),
      write
    });

    await repository.get('credential-a');
    await repository.clear();

    await expect(repository.get('credential-a')).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledWith([]);
  });

  it('serializes local credential changes and does not mix them with routing configuration', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const repository = createCredentialRepository({
      read: vi.fn().mockResolvedValue([]),
      write
    });

    await repository.save({ id: 'credential-edge', password: 'secret', username: 'operator' });

    expect(await repository.get('credential-edge')).toEqual({
      id: 'credential-edge',
      password: 'secret',
      username: 'operator'
    });
    expect(write).toHaveBeenLastCalledWith([
      { id: 'credential-edge', password: 'secret', username: 'operator' }
    ]);

    await repository.remove('credential-edge');
    expect(await repository.get('credential-edge')).toBeUndefined();
  });

  it('rejects corrupt persisted credential records', async () => {
    const repository = createCredentialRepository({
      read: vi
        .fn()
        .mockResolvedValue([{ id: 'credential-edge', password: 3, username: 'operator' }]),
      write: vi.fn().mockResolvedValue(undefined)
    });

    await expect(repository.get('credential-edge')).rejects.toThrow('保存的代理账号密码无效');
  });
});
