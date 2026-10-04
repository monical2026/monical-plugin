import { vi } from 'vitest';
export function fakeChrome() {
  const data: Record<string, Record<string, unknown>> = {
    local: {},
    session: {},
  };
  const area = (name: string) => ({
    get: vi.fn(async (key: string) => ({
      [key]: structuredClone(data[name][key]),
    })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data[name], structuredClone(values));
    }),
    remove: vi.fn(async (key: string) => {
      delete data[name][key];
    }),
    setAccessLevel: vi.fn(async () => {}),
  });
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    request: vi.fn(
      async (
        name: string,
        optionsOrCallback: unknown,
        callback?: (lock: unknown) => unknown,
      ) => {
        const action =
          callback ?? (optionsOrCallback as (lock: unknown) => unknown);
        if (
          callback &&
          (optionsOrCallback as { ifAvailable?: boolean }).ifAvailable &&
          tails.has(name)
        )
          return action(null);
        const previous = tails.get(name) ?? Promise.resolve();
        const current = previous.catch(() => {}).then(() => action({ name }));
        tails.set(name, current);
        try {
          return await current;
        } finally {
          if (tails.get(name) === current) tails.delete(name);
        }
      },
    ),
  };
  const chrome = {
    storage: { local: area('local'), session: area('session') },
    permissions: {
      contains: vi.fn(async () => true),
      request: vi.fn(async () => true),
    },
    runtime: { sendMessage: vi.fn() },
  };
  vi.stubGlobal('chrome', chrome);
  vi.stubGlobal('navigator', { locks });
  return { chrome, data };
}
