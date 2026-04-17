import { describe, it, expect, vi } from 'vitest';

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: 'no session' }) },
  }),
}));

// Mock cookies/headers
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => null, set: () => {} }),
  headers: async () => new Headers(),
}));

// Mock supabase admin (usado pelo getUserContext dentro de requireAdminAction)
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
        order: () => ({ data: [], error: null }),
      }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: 'no session' }) },
  }),
}));

describe('loadPlatformAdmins — comportamento', () => {
  it('lança UNAUTHORIZED sem sessão', async () => {
    const { loadPlatformAdmins } = await import('@/app/admin/platform-admins/actions');
    await expect(loadPlatformAdmins()).rejects.toThrow(/UNAUTHORIZED|não autenticado|unauthorized/i);
  });
});

describe('adicionarAdmin — comportamento', () => {
  it('lança UNAUTHORIZED sem sessão', async () => {
    const { adicionarAdmin } = await import('@/app/admin/platform-admins/actions');
    await expect(adicionarAdmin('test@test.com', 'Test')).rejects.toThrow(/UNAUTHORIZED|não autenticado|unauthorized/i);
  });
});
