'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

// ── Criar nova empresa com auto-slug ────────────────────────────────────────

export async function criarNovaEmpresa(dados: any) {
  const sb = createSupabaseAdmin();
  try {
    // Generate slug from name
    let slug = dados.nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Ensure slug uniqueness
    const { data: existing } = await sb.from('empresas')
      .select('slug')
      .eq('slug', slug);

    if (existing?.length) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const registro = {
      nome: dados.nome,
      slug,
      segmento: dados.segmento || null,
      email_gestor: dados.email_gestor || null,
      email_rh: dados.email_rh || null,
      telefone: dados.telefone || null,
      logo_url: dados.logo_url || null,
      config: dados.config || {},
    };

    const { data, error } = await sb.from('empresas')
      .insert(registro)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data, message: `Empresa "${dados.nome}" criada com slug "${slug}"` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Importar colaboradores em lote (dedup por email) ────────────────────────

export async function importarColaboradoresLote(empresaId: string, colaboradores: any[]) {
  const sb = createSupabaseAdmin();
  try {
    if (!Array.isArray(colaboradores) || !colaboradores.length) {
      return { success: false, error: 'Lista de colaboradores vazia' };
    }

    // Fetch existing emails for dedup
    const { data: existentes } = await sb.from('colaboradores')
      .select('email')
      .eq('empresa_id', empresaId);

    const emailsExistentes = new Set((existentes || []).map(e => e.email?.toLowerCase()));

    const novos = colaboradores
      .filter(c => c.email && !emailsExistentes.has(c.email.toLowerCase()))
      .map(c => ({
        empresa_id: empresaId,
        nome_completo: c.nome_completo || c.nome,
        email: c.email.toLowerCase().trim(),
        cargo: c.cargo || null,
        departamento: c.departamento || null,
        telefone: c.telefone || null,
        gestor_direto: c.gestor_direto || null,
      }));

    const duplicados = colaboradores.length - novos.length;

    if (!novos.length) {
      return { success: true, message: `Nenhum novo colaborador (${duplicados} duplicados ignorados)` };
    }

    // Insert in batches of 100
    let inseridos = 0;
    for (let i = 0; i < novos.length; i += 100) {
      const batch = novos.slice(i, i + 100);
      const { data, error } = await sb.from('colaboradores').insert(batch).select('id');
      if (error) return { success: false, error: error.message };
      inseridos += data?.length || 0;
    }

    return {
      success: true,
      message: `${inseridos} colaboradores importados${duplicados > 0 ? `, ${duplicados} duplicados ignorados` : ''}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Configurar competências iniciais ────────────────────────────────────────

export async function configurarCompetencias(empresaId: string, competencias: any[]) {
  const sb = createSupabaseAdmin();
  try {
    if (!Array.isArray(competencias) || !competencias.length) {
      return { success: false, error: 'Lista de competências vazia' };
    }

    const registros = competencias.map(c => ({
      empresa_id: empresaId,
      nome: c.nome,
      descricao: c.descricao || '',
      cargo: c.cargo || null,
      peso: c.peso || 3,
      origem: c.origem || 'onboarding',
    }));

    const { data, error } = await sb.from('competencias').insert(registros).select('id');
    if (error) return { success: false, error: error.message };

    return { success: true, message: `${data?.length || 0} competências configuradas` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
