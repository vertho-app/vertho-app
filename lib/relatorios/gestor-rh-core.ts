/**
 * Relatórios de GESTOR e de RH — núcleo HEADLESS (sem gate de sessão).
 *
 * Movidos de `actions/relatorios.ts` SEM mudar a lógica: lá, as actions `gerarRelatorioGestor` e `gerarRelatorioRH`
 * mantêm o gate e delegam para cá; o orquestrador do fluxo completo (task do Trigger.dev) chama estes núcleos
 * direto, porque uma task não tem sessão. O PDF e o upload ao Storage vêm junto (eram helpers locais da action).
 *
 * ⚠️ Nenhum dos dois filtra por turma: o do gestor agrupa TODOS os colaboradores por `gestor_email` e o do RH
 * olha a empresa inteira. Quem os dispara decide se isso é aceitável para o escopo da rodada.
 */
import { tenantDb } from '@/lib/tenant-db';
import { mapComLimite } from '@/lib/concurrency';
import { callAI, type AIConfig } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { storageSlug } from '@/lib/storage-slug';
import { caminhoDoPdf, idiomaDaPessoa } from '@/lib/pdf-locale';
import type { AppLocale } from '@/i18n/routing';
import { resolveAppLocale } from '@/lib/i18n';
import { registrarLeituraIndisponivel } from '@/lib/gestor/leitura-indisponivel';
import React from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { RELATORIO_GESTOR_SYSTEM, RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { cargosParaOPrompt, linhasDeNiveisParaOPrompt } from '@/lib/relatorios/niveis-do-rh';

export interface ResultadoRelatorio<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
  detalhes?: GestorDetalhe[];
}

export interface GestorDetalhe {
  gestor: string;
  equipe?: number;
  ok?: boolean;
  erro?: string;
}

type RelatorioTipo = 'individual' | 'gestor' | 'rh';

async function gerarPDFBuffer(
  tipo: RelatorioTipo,
  data: unknown,
  empresaNome: string,
  locale: AppLocale,
): Promise<Buffer | null> {
  let Component: React.ComponentType<any> | undefined;
  if (tipo === 'individual') {
    const mod = await import('@/components/pdf/RelatorioIndividual');
    Component = mod.default;
  } else if (tipo === 'gestor') {
    const mod = await import('@/components/pdf/RelatorioGestor');
    Component = mod.default;
  } else if (tipo === 'rh') {
    const mod = await import('@/components/pdf/RelatorioRH');
    Component = mod.default;
  }
  if (!Component) return null;
  const logoBase64 = getLogoCoverBase64();
  return renderToBuffer(React.createElement(Component, { data, empresaNome, logoBase64, locale }));
}

async function salvarPDFStorage(
  sb: SupabaseClient,
  empresaId: string,
  tipo: RelatorioTipo,
  colaboradorNome: string,
  buffer: Buffer,
  locale: AppLocale,
): Promise<string | null> {
  const slug = storageSlug(colaboradorNome, tipo);
  // O idioma do PDF vai no nome do arquivo (`lib/pdf-locale.ts`): é como o download sabe em que idioma ele nasceu.
  const path = caminhoDoPdf(empresaId, tipo, slug, locale);
  const { error } = await sb.storage.from('relatorios-pdf').upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) { console.error('[PDF Storage]', error.message); return null; }
  return path;
}

export async function gerarRelatorioGestorCore(
  sbRaw: SupabaseClient,
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ResultadoRelatorio> {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    // Busca TODOS os colabs e agrupa por gestor_email (exclui internos @vertho.ai)
    // Exclui STAFF, mantém as personas de demo (`*.demo@vertho.ai`): elas são
    // o CONTEÚDO do tenant de demonstração. Com o filtro cru `%@vertho.ai`, o
    // relatório do gestor saía VAZIO em qualquer tenant de demo — inclusive no
    // que a feira usa. Ver lib/internal-emails.ts.
    const { data: todosColabs } = await excludeInternalEmails(
      tdb.from('colaboradores')
        .select('id, nome_completo, email, cargo, gestor_email, gestor_nome, perfil_dominante, d_natural, i_natural, s_natural, c_natural, role'),
    );

    const equipesPorGestor: Record<string, any[]> = {};
    for (const c of (todosColabs || [])) {
      const ge = (c.gestor_email || '').toLowerCase().trim();
      if (!ge) continue; // colab sem gestor cadastrado é ignorado
      if (!equipesPorGestor[ge]) equipesPorGestor[ge] = [];
      equipesPorGestor[ge].push(c);
    }

    if (Object.keys(equipesPorGestor).length === 0) {
      return { success: false, error: 'Nenhum colaborador tem gestor_email preenchido. Configure em /admin/empresas/gerenciar.' };
    }

    // R-67 (04/10/2026): a leitura executiva é do GESTOR, então sai da IA no idioma dele (`colaboradores.locale`; o
    // gestor sem cadastro no tenant, ou sem idioma, fica com o da empresa, `empresas.default_locale`). Sem `locale`,
    // o `callAI` lia o cookie de quem DISPAROU a geração (a operação, em pt-BR) e o gestor de outro idioma abria a
    // tela traduzida com a síntese em português. Duas leituras próprias, com o `error` checado: se uma falha, a
    // geração segue (é entrega, não construção) no idioma que sobrar, e a falha vai para o `degradacao_log`.
    const idiomaPorColab = new Map<string, string | null>();
    const idsDosGestores = (todosColabs || [])
      .filter((c: any) => equipesPorGestor[(c.email || '').toLowerCase()])
      .map((c: any) => c.id);
    if (idsDosGestores.length) {
      const { data: idiomas, error: errIdiomas } = await tdb.from('colaboradores').select('id, locale').in('id', idsDosGestores);
      if (errIdiomas) await registrarLeituraIndisponivel(empresaId, 'relatorio-gestor-idioma-dos-gestores', errIdiomas.message);
      else for (const r of idiomas || []) idiomaPorColab.set(r.id, r.locale ?? null);
    }
    const { data: idiomaEmpresa, error: errIdiomaEmpresa } = await sbRaw.from('empresas')
      .select('default_locale').eq('id', empresaId).maybeSingle();
    if (errIdiomaEmpresa) await registrarLeituraIndisponivel(empresaId, 'relatorio-gestor-idioma-da-empresa', errIdiomaEmpresa.message);
    const idiomaDaEmpresa: string | null = idiomaEmpresa?.default_locale ?? null;

    // RAG/grounding: traz valores + cultura da empresa pra contextualizar recomendações
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(empresaId, 'valores cultura organizacional políticas desenvolvimento pessoas', 4);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err: any) { console.warn('[gestor grounding]', err?.message); }

    // Avaliações IA4 (uma vez só, indexa por colab)
    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, competencia_nome, avaliacao_ia, nivel_ia4')
      .not('avaliacao_ia', 'is', null);
    const respPorColab: Record<string, any[]> = {};
    for (const r of (respostas || [])) {
      if (!respPorColab[r.colaborador_id]) respPorColab[r.colaborador_id] = [];
      respPorColab[r.colaborador_id].push(r);
    }

    // Relatórios por gestor em paralelo (limite 2 — callAI de 64k tokens);
    // detalhes preservam a ORDEM dos gestores (mapComLimite garante).
    const resultadosGestor = await mapComLimite(Object.entries(equipesPorGestor), 2, async ([gestorEmail, equipe]): Promise<GestorDetalhe> => {
      try {
        // Identifica o gestor (pode estar em colaboradores ou só ser um email externo)
        const gestorColab = (todosColabs || []).find((c: any) => (c.email || '').toLowerCase() === gestorEmail);
        const gestorNome = gestorColab?.nome_completo || equipe[0].gestor_nome || gestorEmail;

        // Membros: cada colab da equipe + suas competências avaliadas
        const membros = equipe.map((c: any) => {
          const respsColab = respPorColab[c.id] || [];
          return {
            nome: c.nome_completo || '—',
            cargo: c.cargo || '—',
            disc_dominante: c.perfil_dominante || '—',
            competencias: respsColab.map((r: any) => {
              const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
              return {
                competencia: r.competencia_nome || '—',
                nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
              };
            }),
          };
        });

        // DISC dist da equipe
        const discDist: Record<'D' | 'I' | 'S' | 'C', number> = { D: 0, I: 0, S: 0, C: 0 };
        equipe.forEach((c: any) => {
          if (c.perfil_dominante) {
            const d = c.perfil_dominante.replace('Alto ', '') as 'D' | 'I' | 'S' | 'C';
            if (discDist[d] !== undefined) discDist[d]++;
          }
        });

        const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})\nGESTOR: ${gestorNome} (${gestorEmail})\nTOTAL EQUIPE: ${membros.length}\nDISC: D=${discDist.D} I=${discDist.I} S=${discDist.S} C=${discDist.C}\n${groundingBlock ? `\n${groundingBlock}\n` : ''}\nDADOS DA EQUIPE:\n${JSON.stringify(membros, null, 2)}`;

        const resultado = await callAI(RELATORIO_GESTOR_SYSTEM, user, aiConfig, 64000, {
          taskKey: 'relatorio_gestor', empresaId,
          locale: resolveAppLocale(gestorColab ? idiomaPorColab.get(gestorColab.id) : null, idiomaDaEmpresa),
        });
        const relatorio: any = await extractJSON(resultado);

        if (!relatorio) { return { gestor: gestorNome, erro: 'IA não retornou JSON' }; }

        // PDF
        let pdfPath: string | null = null;
        try {
          const pdfData = { conteudo: relatorio, gestor_nome: gestorNome, gerado_em: new Date().toISOString() };
          // O relatório é do GESTOR: o texto fixo do papel sai no idioma dele (gestor sem cadastro no tenant: o da empresa).
          const locale = await idiomaDaPessoa(empresaId, gestorColab?.id);
          const buffer = await gerarPDFBuffer('gestor', pdfData, empresa.nome, locale);
          if (buffer) pdfPath = await salvarPDFStorage(sbRaw, empresaId, 'gestor', `${empresa.nome}-${gestorNome}`, buffer, locale);
        } catch (e: any) { console.error('[PDF Gestor]', e.message); }

        // empresa_id é injetado pelo tdb.upsert
        await tdb.from('relatorios').upsert({
          colaborador_id: gestorColab?.id || null,
          tipo: 'gestor',
          conteudo: { ...relatorio, gestor_email: gestorEmail, gestor_nome: gestorNome },
          pdf_path: pdfPath,
          gerado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,colaborador_id,tipo' }).select('id');

        return { gestor: gestorNome, equipe: equipe.length, ok: true };
      } catch (e: any) {
        return { gestor: gestorEmail, erro: e.message };
      }
    });
    const detalhes: GestorDetalhe[] = resultadosGestor;
    const gerados = detalhes.filter(d => (d as any).ok).length;
    const erros = detalhes.filter(d => (d as any).erro).length;

    return {
      success: true,
      message: `${gerados} relatório${gerados !== 1 ? 's' : ''} de gestor gerado${gerados !== 1 ? 's' : ''}${erros ? ` · ${erros} erros` : ''}`,
      detalhes,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function gerarRelatorioRHCore(
  sbRaw: SupabaseClient,
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ResultadoRelatorio> {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: empresa } = await sbRaw.from('empresas')
      .select('nome, segmento').eq('id', empresaId).single();
    if (!empresa) return { success: false, error: 'Empresa não encontrada' };

    const { data: respostasRaw } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, avaliacao_ia, nivel_ia4, nota_ia4')
      .not('avaliacao_ia', 'is', null);
    // exclui respostas de colaboradores internos @vertho.ai das estatísticas RH
    const { data: internosRH } = await tdb.from('colaboradores').select('id').ilike('email', '%@vertho.ai');
    const internosRHSet = new Set((internosRH || []).map((c: any) => c.id));
    const respostas = (respostasRaw || []).filter((r: any) => !internosRHSet.has(r.colaborador_id));

    if (!respostas.length) return { success: false, error: 'Nenhuma avaliação encontrada' };

    // Colaboradores
    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante')
      .in('id', colabIds)
      .not('email', 'ilike', '%@vertho.ai'); // exclui internos da agregação RH
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

    // Competências
    const compIds = [...new Set(respostas.map((r: any) => r.competencia_id).filter(Boolean))];
    const compMap: Record<string, any> = {};
    if (compIds.length) {
      const { data: comps } = await tdb.from('competencias').select('id, nome').in('id', compIds);
      (comps || []).forEach((c: any) => { compMap[c.id] = c; });
    }

    // Indicadores. Lote 5b (04/10/2026): o prompt recebia `MEDIA GERAL` e, por cargo, `media`,
    // e devolvia as duas no relatório que o cliente lê. Agora recebe o NÍVEL MAIS FREQUENTE e a
    // distribuição de avaliações por nível (geral e por cargo), já calculados aqui: a IA copia, não
    // faz a conta. A nota decimal não sai do servidor (`lib/relatorios/niveis-do-rh.ts`).
    const niveis: number[] = respostas.map((r: any) => {
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0;
    }).filter((n: number) => n > 0);

    // Dados por cargo (a pessoa fica junto da avaliação para contar as pessoas distintas)
    const avaliacoesPorCargo: Array<{ cargo: string; colaboradorId: string; nivel: number }> = [];
    respostas.forEach((r: any) => {
      const c = colabMap[r.colaborador_id];
      if (!c) return;
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      avaliacoesPorCargo.push({
        cargo: c.cargo || '\u2014',
        colaboradorId: r.colaborador_id,
        nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
      });
    });
    const cargosData = cargosParaOPrompt(avaliacoesPorCargo);

    // Todos os registros
    const registros = respostas.map((r: any) => {
      const c = colabMap[r.colaborador_id] || {};
      const comp = compMap[r.competencia_id] || {};
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return {
        nome: c.nome_completo || '—', cargo: c.cargo || '—',
        competencia: comp.nome || '—', nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0,
      };
    });

    // DISC organizacional
    const discOrg: Record<'D' | 'I' | 'S' | 'C', number> = { D: 0, I: 0, S: 0, C: 0 };
    (colabs || []).forEach((c: any) => { if (c.perfil_dominante) { const d = c.perfil_dominante.replace('Alto ', '') as 'D' | 'I' | 'S' | 'C'; if (discOrg[d] !== undefined) discOrg[d]++; } });

    // RAG/grounding: contexto institucional pra decisões de RH terem identidade
    let groundingBlock = '';
    try {
      const chunks = await retrieveContext(empresaId, 'valores cultura organizacional políticas treinamento desenvolvimento estrategia', 5);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err: any) { console.warn('[rh grounding]', err?.message); }

    const user = `EMPRESA: ${empresa.nome} (${empresa.segmento})
TOTAL AVALIADOS: ${colabIds.length}
TOTAL AVALIACOES: ${respostas.length}
${linhasDeNiveisParaOPrompt(niveis)}
DISC ORGANIZACIONAL: D=${discOrg.D} I=${discOrg.I} S=${discOrg.S} C=${discOrg.C}
${groundingBlock ? `\n${groundingBlock}\n` : ''}
POR CARGO:
${JSON.stringify(cargosData, null, 2)}

REGISTROS INDIVIDUAIS:
${JSON.stringify(registros, null, 2)}`;

    const resultado = await callAI(RELATORIO_RH_SYSTEM, user, aiConfig, 64000, {
      taskKey: 'relatorio_rh', empresaId,
    });
    const relatorio: any = await extractJSON(resultado);

    if (!relatorio) return { success: false, error: 'IA não retornou relatório válido' };

    let pdfPath: string | null = null;
    try {
      const pdfData = { conteudo: relatorio, gerado_em: new Date().toISOString() };
      // O relatório de RH é da EMPRESA: o texto fixo do papel sai no idioma dela (quem baixa em outro idioma recebe uma versão própria na rota).
      const locale = await idiomaDaPessoa(empresaId, null);
      const buffer = await gerarPDFBuffer('rh', pdfData, empresa.nome, locale);
      if (buffer) pdfPath = await salvarPDFStorage(sbRaw, empresaId, 'rh', empresa.nome, buffer, locale);
    } catch (e: any) { console.error('[PDF Gen RH]', e.message); }

    // Relatório RH é agregado (colaborador_id = NULL).
    // PostgreSQL UNIQUE não detecta conflito em NULL — select+update/insert explícito.
    const { data: existingRh } = await tdb.from('relatorios')
      .select('id').eq('tipo', 'rh').is('colaborador_id', null).maybeSingle();
    if (existingRh) {
      await tdb.from('relatorios').update({ conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString() }).eq('id', existingRh.id);
    } else {
      await tdb.from('relatorios').insert({ colaborador_id: null, tipo: 'rh', conteudo: relatorio, pdf_path: pdfPath, gerado_em: new Date().toISOString() });
    }

    return { success: true, message: `Relatório RH gerado${pdfPath ? ' (PDF salvo)' : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
