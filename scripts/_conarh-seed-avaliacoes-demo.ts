/**
 * CONARH 52 — completa as AVALIAÇÕES do tenant de demonstração.
 *
 *   npx --yes tsx scripts/_conarh-seed-avaliacoes-demo.ts
 *
 * POR QUE EXISTE: os relatórios de gestor e de RH (etapa 5) leem `respostas`.
 * No tenant de demo só a Bruna e a Mariana tinham as 5 competências avaliadas —
 * a Ana não tinha nenhuma e o Paulo tinha duas. O relatório saiu honesto e
 * inútil para a feira: "Ana não possui nenhuma competência avaliada", "a gestora
 * está no escuro". Documento de estande não pode falar de dado faltando.
 *
 * ⚠️ SÓ tenant `is_demo`, e é DADO DE DEMONSTRAÇÃO — níveis plausíveis por
 * perfil, no mesmo formato que a IA4 grava (`consolidacao.notas_por_descritor`).
 * Não é avaliação real e não deve virar base de nenhuma afirmação sobre pessoas.
 *
 * Idempotente: só insere o que falta (não sobrescreve avaliação existente).
 * ⚠️ O `reset:demo` recria o tenant — depois dele, rode este script de novo
 * antes de regerar os PDFs.
 */
import fs from 'node:fs';

const LINHAS_ENV = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/) : [];
for (const linha of LINHAS_ENV) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

import { createSupabaseAdmin } from '@/lib/supabase';

/** As 5 competências comerciais do tenant de demo, com seus descritores. */
const COMPETENCIAS: Array<{ nome: string; descritores: string[] }> = [
  { nome: 'Orientação a Metas e Resultados', descritores: ['Leitura do próprio funil', 'Priorização por impacto', 'Constância de ritmo', 'Reação a desvio de meta'] },
  { nome: 'Comunicação e Apresentação de Valor', descritores: ['Clareza da proposta', 'Ligação com a dor do cliente', 'Prova e evidência', 'Escuta durante a apresentação'] },
  { nome: 'Negociação e Fechamento', descritores: ['Preparação da negociação', 'Tratamento de objeção', 'Defesa de valor sem desconto', 'Condução ao próximo passo'] },
  { nome: 'Relacionamento e Pós-venda', descritores: ['Cadência de contato', 'Transparência sob problema', 'Ampliação da conta', 'Recuperação de confiança'] },
  { nome: 'Resiliência e Constância', descritores: ['Reação à rejeição', 'Regulação sob pressão', 'Consistência semanal', 'Pedido de ajuda no tempo certo'] },
];

/**
 * Perfil de desempenho por pessoa: um nível-base por competência (na ordem
 * acima). Variação de propósito — um relatório em que todos estão iguais não
 * mostra o que o gestor faria com ele.
 */
const PERFIS: Record<string, number[]> = {
  'ana.demo@vertho.ai': [3, 2, 2, 3, 2],
  'paulo.demo@vertho.ai': [2, 2, 1, 2, 1],
};

function avaliacao(competencia: string, descritores: string[], nivelBase: number, cargo: string, nome: string) {
  const notas: Record<string, unknown> = {};
  descritores.forEach((d, i) => {
    // Espalha em torno do nível-base: nem tudo igual dentro da competência.
    const nivel = Math.min(4, Math.max(1, nivelBase + (i % 3 === 0 ? 0 : i % 3 === 1 ? -1 : 1)));
    notas[`D${i + 1}`] = {
      nome: d,
      nivel,
      nota_decimal: Number((nivel + (i % 2 ? 0.33 : -0.17)).toFixed(2)),
      confianca: 70 + ((i * 7) % 25),
    };
  });
  const medias = Object.values(notas).map((n) => (n as { nota_decimal: number }).nota_decimal);
  const media = medias.reduce((s, n) => s + n, 0) / medias.length;
  return {
    competencia,
    profissional: nome,
    cargo,
    consolidacao: {
      nivel_geral: Math.min(4, Math.max(1, Math.floor(media))),
      media_descritores: Number(media.toFixed(2)),
      confianca_geral: 76,
      gap: Math.max(0, 3 - Math.floor(media)),
      travas_aplicadas: [],
      notas_por_descritor: notas,
    },
    descritores_destaque: descritores.slice(0, 2),
    feedback: `Avaliação de demonstração — ${competencia} para ${nome}.`,
  };
}

async function main() {
  const sb = createSupabaseAdmin();
  const { data: empresa } = await sb.from('empresas').select('id, nome, is_demo').eq('is_demo', true).limit(1).maybeSingle();
  if (!empresa) throw new Error('nenhuma empresa is_demo — recusando semear tenant real');

  const { data: colabs } = await sb
    .from('colaboradores').select('id, nome_completo, email, cargo').eq('empresa_id', empresa.id);
  const { data: jaTem } = await sb
    .from('respostas').select('colaborador_id, competencia_nome').eq('empresa_id', empresa.id);
  const existente = new Set((jaTem || []).map((r) => `${r.colaborador_id}:::${r.competencia_nome}`));

  const novas: Array<Record<string, unknown>> = [];
  for (const [email, niveis] of Object.entries(PERFIS)) {
    const colab = (colabs || []).find((c) => (c.email || '').toLowerCase() === email);
    if (!colab) { console.warn(`persona ${email} não existe no tenant de demo — pulando`); continue; }
    COMPETENCIAS.forEach((comp, i) => {
      if (existente.has(`${colab.id}:::${comp.nome}`)) return; // não sobrescreve
      const av = avaliacao(comp.nome, comp.descritores, niveis[i], colab.cargo || '—', colab.nome_completo || '—');
      novas.push({
        empresa_id: empresa.id,
        colaborador_id: colab.id,
        competencia_nome: comp.nome,
        nivel_ia4: av.consolidacao.nivel_geral,
        avaliacao_ia: av,
      });
    });
  }

  if (!novas.length) { console.log('nada a semear — todas as avaliações já existem'); return; }
  const { error } = await sb.from('respostas').insert(novas);
  if (error) throw new Error(error.message);
  console.log(`OK ${novas.length} avaliações de demonstração inseridas em ${empresa.nome}`);
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
