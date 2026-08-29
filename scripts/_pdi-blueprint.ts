/* eslint-disable */
// INTERNO/descartável: busca o blueprint real e renderiza o PDI com trilha_mapa +
// blueprint_objetivos (binding real na página "vira trilha"). npx tsx scripts/_pdi-blueprint.ts
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioIndividualPDF from '@/components/pdf/RelatorioIndividual';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';
import { createClient } from '@supabase/supabase-js';

const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k: string) => ENV.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1]?.trim();
const sb = createClient(pick('NEXT_PUBLIC_SUPABASE_URL')!, pick('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const COLAB = 'afc866ce-91a9-4bf8-94d2-676b4878308e';

(async () => {
  const { data } = await sb.from('development_blueprints').select('blueprint').eq('colaborador_id', COLAB).order('gerado_em', { ascending: false }).limit(1).single();
  const bp: any = data!.blueprint;

  // Monta o que o gerarRelatorioIndividual gravaria (sprint derivado + trilha_mapa + objetivos)
  const blueprint_objetivos: Record<string, any> = {};
  for (const c of bp.competencias) for (const o of (c.objetivos_30_dias || [])) blueprint_objetivos[o.id] = { competencia: c.nome, objetivo: o.objetivo, acao_principal: o.acao_principal };
  const competencias = bp.competencias.map((c: any) => {
    const o = (c.objetivos_30_dias || [])[0] || {};
    return {
      nome: c.nome, nivel: Number(String(c.nivel_atual).replace('N', '')) || 1, nota_decimal: 1.6, flag: false,
      descritores_desenvolvimento: (c.descritores_foco || []).map((d: any) => d.nome),
      fez_bem: ['Presença e compromisso com a equipe'], melhorar: (c.descritores_foco || []).slice(0, 2).map((d: any) => d.gap_observado || d.nome),
      feedback: c.leitura,
      sprint: { foco_30_dias: o.objetivo, acao_principal: o.acao_principal, acao_apoio: o.acao_apoio, evidencia_esperada: o.evidencia_de_execucao, ritual: o.ritual, checklist: [o.criterio_de_sucesso || 'Critério cumprido'] },
    };
  });
  const conteudo: any = {
    acolhimento: 'Elizângela, este plano parte das suas respostas reais e do seu blueprint de desenvolvimento.',
    resumo_geral: { leitura: bp.foco_geral?.tese_de_desenvolvimento, principais_forcas: ['Presença com a equipe'], principal_ponto_de_atencao: bp.foco_geral?.risco_se_nao_desenvolver },
    resumo_desempenho: competencias.map((c: any) => ({ competencia: c.nome, nivel: c.nivel, nota_decimal: c.nota_decimal, leitura: c.feedback })),
    competencias,
    mensagem_final: bp.foco_geral?.mensagem_central,
    trilha_mapa: bp.trilha,
    blueprint_objetivos,
  };
  const buf = Buffer.from(await renderToBuffer(
    // @ts-ignore - JSX com renderToBuffer (mesmo padrão de app/api/radar/lead-pdf/route.ts)
    React.createElement(RelatorioIndividualPDF, { data: { conteudo, colaborador_nome: 'Elizângela Ferreira Bastos', colaborador_cargo: 'Coordenação Pedagógica', gerado_em: new Date('2026-07-08').toISOString() }, empresaNome: 'Secretaria Municipal de Ibipeba/BA', logoBase64: getLogoCoverBase64() || undefined }),
  ));
  const out = path.join(os.homedir(), 'Downloads', 'vertho-pdi-BLUEPRINT-check.pdf');
  fs.writeFileSync(out, buf);
  console.log('OK', out, (buf.length / 1024 | 0) + 'KB');
})().catch((e) => { console.error(e); process.exit(1); });
