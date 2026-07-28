export interface ProxyCredential {
  id: string;
  username: string;
  password: string;
}

export interface CredentialStorage {
  read(): Promise<unknown>;
  write(credentials: readonly ProxyCredential[]): Promise<void>;
}

export interface CredentialRepository {
  get(id: string): Promise<ProxyCredential | undefined>;
  remove(id: string): Promise<void>;
  save(credential: ProxyCredential): Promise<void>;
}

/**
 * Keeps account secrets in one local-only store. Configuration contains only a
 * credential id, never a username or password.
 */
export function createCredentialRepository(storage: CredentialStorage): CredentialRepository {
  let cache: readonly ProxyCredential[] | undefined;
  let mutation = Promise.resolve();

  async function current(): Promise<readonly ProxyCredential[]> {
    if (cache === undefined) {
      cache = await readCredentials(storage);
    }
    return cache;
  }

  function queue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = mutation.then(operation);
    mutation = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  return {
    async get(id) {
      await mutation;
      return (await current()).find((credential) => credential.id === id);
    },
    remove(id) {
      return queue(async () => {
        const next = (await current()).filter((credential) => credential.id !== id);
        await storage.write(next);
        cache = next;
      });
    },
    save(credential) {
      if (!isProxyCredential(credential)) {
        return Promise.reject(new Error('代理账号密码无效'));
      }
      return queue(async () => {
        const next = [
          ...(await current()).filter((existing) => existing.id !== credential.id),
          { ...credential }
        ];
        await storage.write(next);
        cache = next;
      });
    }
  };
}

async function readCredentials(storage: CredentialStorage): Promise<readonly ProxyCredential[]> {
  const stored = await storage.read();
  if (stored === undefined) {
    return [];
  }
  if (!Array.isArray(stored) || !stored.every(isProxyCredential)) {
    throw new Error('保存的代理账号密码无效');
  }
  return stored.map((credential) => ({ ...credential }));
}

function isProxyCredential(input: unknown): input is ProxyCredential {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const credential = input as Partial<ProxyCredential>;
  return (
    typeof credential.id === 'string' &&
    credential.id.trim().length > 0 &&
    typeof credential.username === 'string' &&
    credential.username.trim().length > 0 &&
    typeof credential.password === 'string'
  );
}
