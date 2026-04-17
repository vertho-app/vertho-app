import { describe, it, expect, vi } from 'vitest';

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: 'no session' }) },
  }),
}));

// Mock cookies
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [] }),
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
        }),
      }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: 'no session' }) },
  }),
}));

describe('loadAdminDashboard — comportamento', () => {
  it('lança UNAUTHORIZED sem sessão', async () => {
    const { loadAdminDashboard } = await import('@/app/admin/dashboard/actions');
    await expect(loadAdminDashboard()).rejects.toThrow(/UNAUTHORIZED|não autenticado|unauthorized/i);
  });
});
