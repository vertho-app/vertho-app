'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { moodleGetCourses, moodleGetCourseContents } from '@/lib/moodle';
import { callAI } from './ai-client';
import { extractJSON } from './utils';

// ══════════════════════════════════════════════════════════════════════════════
// 1. IMPORTAR CATÁLOGO DO MOODLE
// ══════════════════════════════════════════════════════════════════════════════

export async function moodleImportarCatalogo(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Verificar configuração
    if (!process.env.MOODLE_TOKEN) return { success: false, error: 'MOODLE_TOKEN não configurado nas env vars' };
    if (!process.env.MOODLE_URL) return { success: false, error: 'MOODLE_URL não configurado nas env vars' };

    // Buscar todos os cursos do Moodle
    const cursos = await moodleGetCourses();
    if (!cursos?.length) return { success: false, error: 'Nenhum curso encontrado no Moodle (API retornou vazio)' };

    const moodleUrl = process.env.MOODLE_URL || 'https://academia.vertho.ai';
    let importados = 0, ultimoErro = '';

    for (const curso of cursos) {
      // Buscar conteúdo de cada curso (seções + módulos)
      let secoes = [], modulos = [];
      try {
        const contents = await moodleGetCourseContents(curso.id);
        secoes = (contents || []).map(s => s.name).filter(Boolean);
        modulos = (contents || []).flatMap(s => (s.modules || []).map(m => m.name)).filter(Boolean);
      } catch {}

      const { error } = await sb.from('moodle_catalogo').upsert({
        empresa_id: empresaId,
        course_id: curso.id,
        curso_nome: curso.fullname || curso.shortname,
        curso_url: `${moodleUrl}/course/view.php?id=${curso.id}`,
        qtd_secoes: secoes.length,
        qtd_modulos: modulos.length,
        secoes: secoes.join(' | '),
        modulos: modulos.join(' | '),
      }, { onConflict: 'empresa_id,course_id' });

      if (!error) importados++;
      else ultimoErro = error.message;
    }

    return { success: true, message: `${importados}/${cursos.length} cursos importados do Moodle${ultimoErro ? ` — ${ultimoErro}` : ''}. Rode "Catalogar Conteúdos" para classificar com IA.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CATALOGAR CONTEÚDOS COM IA
// ══════════════════════════════════════════════════════════════════════════════

export async function catalogarConteudosMoodle(empresaId, aiConfig = {}) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar catálogo importado
    const { data: catalogo } = await sb.from('moodle_catalogo')
      .select('*').eq('empresa_id', empresaId).order('curso_nome');

    if (!catalogo?.length) return { success: false, error: 'Catálogo vazio. Rode "Importar Catálogo" primeiro.' };

    // Buscar competências da empresa (agrupadas por cargo)
    const { data: comps } = await sb.from('competencias')
      .select('nome, cod_comp, cargo, pilar')
      .eq('empresa_id', empresaId);

    const compsPorCargo = {};
    (comps || []).forEach(c => {
      const key = c.cargo || '_geral';
      if (!compsPorCargo[key]) compsPorCargo[key] = new Set();
      compsPorCargo[key].add(c.nome);
    });

    const competenciasTexto = Object.entries(compsPorCargo)
      .map(([cargo, nomes]) => `${cargo}: ${[...nomes].join(', ')}`)
      .join('\n');

    // Limpar catálogo enriquecido anterior
    await sb.from('catalogo_enriquecido').delete().eq('empresa_id', empresaId);

    // Processar em batches de 8 cursos
    const BATCH = 8;
    let totalCatalogados = 0;

    for (let i = 0; i < catalogo.length; i += BATCH) {
      const batch = catalogo.slice(i, i + BATCH);

      const cursosTexto = batch.map(c =>
        `Course ID: ${c.course_id} | Nome: ${c.curso_nome} | Módulos: ${c.modulos || '(vazio)'}`
      ).join('\n');

      const system = `Voce e um especialista em catalogacao de conteudos educacionais para avaliacao por competencias.

Classifique cada curso Moodle por cargo e competencia.
Um mesmo curso pode gerar MULTIPLAS linhas (1 por cargo aplicavel).

COMPETENCIAS DISPONIVEIS POR CARGO:
${competenciasTexto}

REGRAS:
- Match EXATO com as competencias listadas acima
- Se nao encontrar match, use tipo "administrativo" sem cargo
- nivel_ideal: 1=basico, 2=intermediario, 3=avancado, 4=excelencia
- tempo_estimado_min: multiplos de 5
- confianca: alta/media/baixa

Retorne APENAS JSON (array):
[{"course_id":6,"cargo":"Gerente","competencia":"Lideranca de Times","competencia_secundaria":null,"descritor_1":"desc","descritor_2":null,"descritor_3":null,"nivel_ideal":2,"tempo_estimado_min":15,"confianca":"alta","tipo":"conteudo"}]`;

      const user = `Classifique estes ${batch.length} cursos:\n\n${cursosTexto}`;

      const resultado = await callAI(system, user, aiConfig, 8000);
      const classificados = await extractJSON(resultado);

      if (Array.isArray(classificados)) {
        for (const item of classificados) {
          await sb.from('catalogo_enriquecido').insert({
            empresa_id: empresaId,
            course_id: item.course_id,
            cargo: item.cargo || null,
            competencia: item.competencia || null,
            competencia_secundaria: item.competencia_secundaria || null,
            descritor_1: item.descritor_1 || null,
            descritor_2: item.descritor_2 || null,
            descritor_3: item.descritor_3 || null,
            nivel_ideal: item.nivel_ideal || null,
            tempo_estimado_min: item.tempo_estimado_min || null,
            confianca: item.confianca || null,
            tipo: item.tipo || 'conteudo',
          });
          totalCatalogados++;
        }
      }
    }

    return { success: true, message: `${totalCatalogados} registros catalogados de ${catalogo.length} cursos. Rode "Cobertura" para ver gaps.` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. COBERTURA DE CONTEÚDO
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarCoberturaConteudo(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar competências com descritores
    const { data: comps } = await sb.from('competencias')
      .select('nome, cod_comp, cargo, cod_desc, nome_curto')
      .eq('empresa_id', empresaId)
      .not('cod_desc', 'is', null);

    if (!comps?.length) return { success: false, error: 'Nenhuma competência com descritores encontrada' };

    // Buscar catálogo enriquecido
    const { data: catalogo } = await sb.from('catalogo_enriquecido')
      .select('course_id, cargo, competencia, descritor_1, descritor_2, descritor_3, nivel_ideal')
      .eq('empresa_id', empresaId);

    if (!catalogo?.length) return { success: false, error: 'Catálogo enriquecido vazio. Rode "Catalogar Conteúdos" primeiro.' };

    // Buscar nomes dos cursos
    const { data: cursosCat } = await sb.from('moodle_catalogo')
      .select('course_id, curso_nome').eq('empresa_id', empresaId);
    const cursoNomeMap = {};
    (cursosCat || []).forEach(c => { cursoNomeMap[c.course_id] = c.curso_nome; });

    // Limpar cobertura anterior
    await sb.from('cobertura_conteudo').delete().eq('empresa_id', empresaId);

    // Agrupar competências por cargo + nome + descritor
    const expectativa = {};
    comps.forEach(c => {
      const key = `${c.cargo}::${c.nome}::${c.cod_desc}`;
      if (!expectativa[key]) {
        expectativa[key] = { cargo: c.cargo, competencia: c.nome, descritor: c.nome_curto || c.cod_desc };
      }
    });

    let totalGaps = 0, totalCobertos = 0;

    for (const [key, exp] of Object.entries(expectativa)) {
      // Buscar cursos que cobrem este cargo + competência
      const cursosMatch = catalogo.filter(c =>
        c.cargo === exp.cargo && c.competencia === exp.competencia
      );

      // Separar por faixa de nível
      const n1n2 = cursosMatch.filter(c => c.nivel_ideal === 1);
      const n2n3 = cursosMatch.filter(c => c.nivel_ideal === 2);

      const n1n2Status = n1n2.length >= 2 ? 'verde' : n1n2.length === 1 ? 'amarelo' : 'vermelho';
      const n2n3Status = n2n3.length >= 2 ? 'verde' : n2n3.length === 1 ? 'amarelo' : 'vermelho';

      if (n1n2Status === 'vermelho' || n2n3Status === 'vermelho') totalGaps++;
      else totalCobertos++;

      const coberturaPct = ((n1n2.length > 0 ? 50 : 0) + (n2n3.length > 0 ? 50 : 0));

      await sb.from('cobertura_conteudo').insert({
        empresa_id: empresaId,
        cargo: exp.cargo,
        competencia: exp.competencia,
        descritor: exp.descritor,
        n1_n2_status: n1n2Status,
        n1_n2_qtd: n1n2.length,
        n1_n2_cursos: n1n2.map(c => cursoNomeMap[c.course_id] || c.course_id).join(', '),
        n2_n3_status: n2n3Status,
        n2_n3_qtd: n2n3.length,
        n2_n3_cursos: n2n3.map(c => cursoNomeMap[c.course_id] || c.course_id).join(', '),
        cobertura_pct: coberturaPct,
      });
    }

    const total = Object.keys(expectativa).length;
    const pctCobertura = total > 0 ? Math.round((totalCobertos / total) * 100) : 0;

    return {
      success: true,
      message: `Cobertura: ${totalCobertos}/${total} cobertos (${pctCobertura}%), ${totalGaps} gaps identificados`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
