'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

// ── Limpar sessões antigas ──────────────────────────────────────────────────

export async function limparSessoesAntigas(dias = 30) {
  const sb = createSupabaseAdmin();
  try {
    const cutoff = new Date(Date.now() - dias * 86400000).toISOString();
    const { count, error } = await sb.from('envios_diagnostico')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff)
      .is('respondido_em', null);

    if (error) return { success: false, error: error.message };
    return { success: true, message: `${count || 0} sessões antigas removidas (> ${dias} dias)` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Limpar sessões de teste ─────────────────────────────────────────────────

export async function limparSessoesTeste() {
  const sb = createSupabaseAdmin();
  try {
    const { count, error } = await sb.from('envios_diagnostico')
      .delete({ count: 'exact' })
      .ilike('email', '%@teste%');

    if (error) return { success: false, error: error.message };
    return { success: true, message: `${count || 0} sessões de teste removidas` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Estatísticas do banco ───────────────────────────────────────────────────

export async function estatisticasBanco() {
  const sb = createSupabaseAdmin();
  try {
    const tabelas = [
      'empresas',
      'colaboradores',
      'competencias',
      'competencias_base',
      'banco_cenarios',
      'envios_diagnostico',
      'respostas',
      'relatorios',
      'pdis',
      'trilhas',
      'ppp_escolas',
    ];

    const stats = {};

    for (const tabela of tabelas) {
      try {
        const { count } = await sb.from(tabela)
          .select('*', { count: 'exact', head: true });
        stats[tabela] = count || 0;
      } catch (_) {
        stats[tabela] = 'N/A';
      }
    }

    const totalRegistros = Object.values(stats)
      .filter(v => typeof v === 'number')
      .reduce((sum, v) => sum + v, 0);

    return {
      success: true,
      message: `Total: ${totalRegistros} registros em ${tabelas.length} tabelas`,
      stats,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
