/**
 * CONARH 52 — gera os relatórios AGREGADOS da etapa 5 (gestor e RH) para o
 * tenant de DEMONSTRAÇÃO, com os prompts e os componentes REAIS do produto.
 *
 *   npx --yes tsx scripts/_conarh-relatorios-gestao.ts
 *   → public/conarh/media/relatorio-gestor.pdf
 *   → public/conarh/media/relatorio-rh.pdf
 *
 * A etapa 5 responde "o que eu levo para a diretoria". Até 05/08/2026 ela
 * mostrava só a tabela de antes/depois na tela — os documentos que o gestor e
 * o RH realmente recebem não apareciam.
 *
 * ⚠️ SÓ tenant `is_demo`. Os relatórios de gestor/RH que existem no banco são
 * de clientes reais (Ibipeba, Macaé) — material de feira circula em print e
 * WhatsApp, e PII de cliente não entra nisso.
 *
 * Custo: 2 chamadas de IA (uma por relatório). O texto sai do prompt de
 * produção (`lib/relatorios/prompts.ts`), não de uma cópia.
 */
import fs from 'node:fs';
import path from 'node:path';

const LINHAS_ENV = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/) : [];
for (const linha of LINHAS_ENV) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

// Estático e nesta ordem: `styles` registra a fonte NotoSans e o render tem que
// acontecer na MESMA instância do renderer (ver _conarh-guia-pdf.ts).
import '@/components/pdf/styles';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioGestorPDF from '@/components/pdf/RelatorioGestor';
import RelatorioRHPDF from '@/components/pdf/RelatorioRH';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { RELATORIO_GESTOR_SYSTEM, RELATORIO_RH_SYSTEM } from '@/lib/relatorios/prompts';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

const DESTINO_GESTOR = 'public/conarh/media/relatorio-gestor.pdf';
const DESTINO_RH = 'public/conarh/media/relatorio-rh.pdf';

function extrairJSON(texto: string): any {
  const limpo = String(texto).replace(/```json|```/g, '').trim();
  const i = limpo.indexOf('{');
  const j = limpo.lastIndexOf('}');
  if (i < 0 || j < 0) throw new Error('IA não devolveu JSON');
  return JSON.parse(limpo.slice(i, j + 1));
}

async function salvar(destino: string, bytes: Uint8Array) {
  const alvo = path.join(process.cwd(), destino);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, Buffer.from(bytes));
  console.log(`OK ${destino} — ${(Buffer.from(bytes).length / 1024) | 0} KB`);
}

async function main() {
  const sb = createSupabaseAdmin();

  const { data: empresa, error: errEmp } = await sb
    .from('empresas').select('id, nome, segmento, is_demo').eq('is_demo', true).limit(1).maybeSingle();
  if (errEmp) throw new Error(errEmp.message);
  if (!empresa) throw new Error('nenhuma empresa is_demo — recusando gerar com dados de cliente');

  const { data: colabs } = await sb
    .from('colaboradores')
    .select('id, nome_completo, email, cargo, gestor_email, gestor_nome, perfil_dominante')
    .eq('empresa_id', empresa.id);

  const { data: respostas } = await sb
    .from('respostas')
    .select('colaborador_id, competencia_nome, nivel_ia4, avaliacao_ia')
    .eq('empresa_id', empresa.id);

  const respPorColab: Record<string, any[]> = {};
  for (const r of respostas || []) {
    (respPorColab[r.colaborador_id] ||= []).push(r);
  }

  const compsDoColab = (c: any) =>
    (respPorColab[c.id] || []).map((r: any) => {
      const av = typeof r.avaliacao_ia === 'string' ? JSON.parse(r.avaliacao_ia) : r.avaliacao_ia;
      return { competencia: r.competencia_nome || '—', nivel: av?.consolidacao?.nivel_geral || r.nivel_ia4 || 0 };
    });

  // ── 1) GESTOR — a equipe de quem tem liderados cadastrados ───────────────
  const equipe = (colabs || []).filter((c) => c.gestor_email);
  if (!equipe.length) throw new Error('nenhum colaborador com gestor_email no tenant de demo');
  const gestorEmail = String(equipe[0].gestor_email).toLowerCase();
  const gestor = (colabs || []).find((c) => (c.email || '').toLowerCase() === gestorEmail);
  const gestorNome = gestor?.nome_completo || equipe[0].gestor_nome || gestorEmail;

  const membros = equipe.map((c) => ({
    nome: c.nome_completo || '—',
    cargo: c.cargo || '—',
    disc_dominante: c.perfil_dominante || '—',
    competencias: compsDoColab(c),
  }));
  const disc = { D: 0, I: 0, S: 0, C: 0 } as Record<string, number>;
  for (const c of equipe) {
    const d = String(c.perfil_dominante || '').replace('Alto ', '').charAt(0);
    if (disc[d] !== undefined) disc[d]++;
  }

  const userGestor = `EMPRESA: ${empresa.nome} (${empresa.segmento})\nGESTOR: ${gestorNome} (${gestorEmail})\nTOTAL EQUIPE: ${membros.length}\nDISC: D=${disc.D} I=${disc.I} S=${disc.S} C=${disc.C}\n\nDADOS DA EQUIPE:\n${JSON.stringify(membros, null, 2)}`;
  console.log(`gerando relatório do gestor: ${gestorNome} · ${membros.length} liderados…`);
  const conteudoGestor = extrairJSON(await callAI(RELATORIO_GESTOR_SYSTEM, userGestor, {}, 64000));

  const logo = await getLogoCoverBase64();
  await salvar(DESTINO_GESTOR, await renderToBuffer(
    React.createElement(RelatorioGestorPDF as never, {
      data: { conteudo: conteudoGestor, gestor_nome: gestorNome, gerado_em: new Date().toISOString() },
      empresaNome: empresa.nome,
      logoBase64: logo,
    }) as never,
  ));

  // ── 2) RH — visão da empresa inteira ─────────────────────────────────────
  const todos = (colabs || []).map((c) => ({
    nome: c.nome_completo || '—',
    cargo: c.cargo || '—',
    disc_dominante: c.perfil_dominante || '—',
    competencias: compsDoColab(c),
  }));
  const userRH = `EMPRESA: ${empresa.nome} (${empresa.segmento})\nTOTAL DE COLABORADORES: ${todos.length}\n\nDADOS POR COLABORADOR:\n${JSON.stringify(todos, null, 2)}`;
  console.log(`gerando relatório de RH: ${todos.length} pessoas…`);
  const conteudoRH = extrairJSON(await callAI(RELATORIO_RH_SYSTEM, userRH, {}, 64000));

  await salvar(DESTINO_RH, await renderToBuffer(
    React.createElement(RelatorioRHPDF as never, {
      data: { conteudo: conteudoRH, gerado_em: new Date().toISOString() },
      empresaNome: empresa.nome,
      logoBase64: logo,
    }) as never,
  ));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
