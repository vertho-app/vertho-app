'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import { extractJSON } from './utils';
import { incrementarVersaoRegua } from '@/lib/versioning';

// ── IA1: Gerar top 10 competências por cargo ────────────────────────────────

export async function rodarIA1(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar empresa — ppp_texto pode não existir no schema
    let empresa;
    const { data: emp1, error: empErr } = await sb.from('empresas')
      .select('nome, segmento, ppp_texto')
      .eq('id', empresaId).single();
    if (emp1) {
      empresa = emp1;
    } else {
      // Fallback sem ppp_texto
      const { data: emp2 } = await sb.from('empresas')
        .select('nome, segmento')
        .eq('id', empresaId).single();
      empresa = emp2;
    }
    if (!empresa) return { success: false, error: `Empresa não encontrada (id: ${empresaId})` };

    const { data: cargos } = await sb.from('colaboradores')
      .select('cargo')
      .eq('empresa_id', empresaId);

    const cargosUnicos = [...new Set((cargos || []).map(c => c.cargo).filter(Boolean))];
    if (!cargosUnicos.length) return { success: false, error: 'Nenhum cargo encontrado' };

    const system = `Você é um especialista em gestão por competências comportamentais.
Responda APENAS com JSON válido, sem texto adicional.`;

    let totalGeradas = 0;

    for (const cargo of cargosUnicos) {
      const user = `Para a empresa "${empresa.nome}" do segmento "${empresa.segmento}", cargo "${cargo}":
${empresa.ppp_texto ? `Contexto PPP: ${empresa.ppp_texto}\n` : ''}
Gere as 10 competências comportamentais mais relevantes.
Formato JSON:
[{"nome": "...", "descricao": "...", "cod_comp": "COMP-01"}]`;

      const resposta = await callAI(system, user, aiConfig, 4096);
      const competencias = await extractJSON(resposta);

      if (Array.isArray(competencias)) {
        for (const comp of competencias) {
          // Verificar se já existe
          const { data: existe } = await sb.from('competencias')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('cargo', cargo)
            .eq('nome', comp.nome)
            .maybeSingle();
          if (existe) continue;

          await sb.from('competencias').insert({
            empresa_id: empresaId,
            cargo,
            nome: comp.nome,
            descricao: comp.descricao,
            cod_comp: comp.cod_comp || comp.nome.substring(0, 10).toUpperCase(),
          });
          totalGeradas++;
        }
      }
    }

    return { success: true, message: `IA1 concluída: ${totalGeradas} competências geradas para ${cargosUnicos.length} cargos` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── IA2: Gerar gabarito (rubrica de respostas) ──────────────────────────────

export async function rodarIA2(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: competencias } = await sb.from('competencias')
      .select('*')
      .eq('empresa_id', empresaId);

    if (!competencias?.length) return { success: false, error: 'Nenhuma competência encontrada. Rode IA1 primeiro.' };

    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const system = `Você é um especialista em avaliação por competências.
Responda APENAS com JSON válido.`;

    let totalGabaritos = 0;

    for (const comp of competencias) {
      const user = `Para a competência "${comp.nome}" (${comp.descricao}) na empresa "${empresa.nome}" (${empresa.segmento}), cargo "${comp.cargo}":

Gere o gabarito de avaliação com 5 níveis de proficiência (1 a 5).
Formato JSON:
{
  "competencia_id": "${comp.id}",
  "niveis": [
    {"nivel": 1, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 2, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 3, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 4, "descricao": "...", "indicadores": ["..."]},
    {"nivel": 5, "descricao": "...", "indicadores": ["..."]}
  ]
}`;

      const resposta = await callAI(system, user, aiConfig, 4096);
      const gabarito = await extractJSON(resposta);

      if (gabarito?.niveis) {
        await sb.from('competencias')
          .update({ gabarito: gabarito.niveis })
          .eq('id', comp.id);
        await incrementarVersaoRegua(comp.id);
        totalGabaritos++;
      }
    }

    return { success: true, message: `IA2 concluída: ${totalGabaritos} gabaritos gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── IA3: Gerar cenários contextuais ─────────────────────────────────────────

export async function rodarIA3(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('nome, segmento')
      .eq('id', empresaId).single();

    const { data: competencias } = await sb.from('competencias')
      .select('*')
      .eq('empresa_id', empresaId);

    if (!competencias?.length) return { success: false, error: 'Nenhuma competência encontrada.' };

    const system = `Você é um especialista em avaliação comportamental por cenários situacionais.
Responda APENAS com JSON válido.`;

    let totalCenarios = 0;

    for (const comp of competencias) {
      const user = `Para a competência "${comp.nome}" na empresa "${empresa.nome}" (${empresa.segmento}), cargo "${comp.cargo}":

Crie 3 cenários situacionais com 4 alternativas cada (A, B, C, D), onde cada alternativa mapeia para um nível de proficiência diferente.
Formato JSON:
[{
  "titulo": "...",
  "descricao": "Situação contextual...",
  "alternativas": [
    {"letra": "A", "texto": "...", "nivel": 1},
    {"letra": "B", "texto": "...", "nivel": 2},
    {"letra": "C", "texto": "...", "nivel": 3},
    {"letra": "D", "texto": "...", "nivel": 5}
  ]
}]`;

      const resposta = await callAI(system, user, aiConfig, 6000);
      const cenarios = await extractJSON(resposta);

      if (Array.isArray(cenarios)) {
        for (const cenario of cenarios) {
          await sb.from('banco_cenarios').insert({
            empresa_id: empresaId,
            competencia_id: comp.id,
            cargo: comp.cargo,
            titulo: cenario.titulo,
            descricao: cenario.descricao,
            alternativas: cenario.alternativas,
          });
          totalCenarios++;
        }
      }
    }

    return { success: true, message: `IA3 concluída: ${totalCenarios} cenários gerados` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Popular Cenários (template do banco_cenarios) ───────────────────────────

export async function popularCenarios(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data: empresa } = await sb.from('empresas')
      .select('segmento')
      .eq('id', empresaId).single();

    // Buscar cenários-template (sem empresa_id) do mesmo segmento
    const { data: templates } = await sb.from('banco_cenarios')
      .select('*')
      .is('empresa_id', null)
      .eq('segmento', empresa.segmento);

    if (!templates?.length) {
      return { success: false, error: 'Nenhum cenário template encontrado para este segmento' };
    }

    const novos = templates.map(t => ({
      empresa_id: empresaId,
      competencia_id: t.competencia_id,
      cargo: t.cargo,
      titulo: t.titulo,
      descricao: t.descricao,
      alternativas: t.alternativas,
    }));

    const { error } = await sb.from('banco_cenarios').insert(novos);
    if (error) return { success: false, error: error.message };

    return { success: true, message: `${novos.length} cenários populados do template` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
