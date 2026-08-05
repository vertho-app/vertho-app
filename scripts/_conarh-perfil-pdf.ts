/**
 * CONARH 52 — gera o PDF do RELATÓRIO COMPORTAMENTAL da persona da etapa 4,
 * com o componente REAL do produto (`components/pdf/RelatorioComportamental`).
 *
 *   npx --yes tsx scripts/_conarh-perfil-pdf.ts
 *   → public/conarh/perfil-<persona>.pdf
 *
 * O `.env.local` é lido pelo próprio script: `tsx` vem por `npx` e não combina
 * com `node --env-file`, e sem as chaves do Supabase o script falharia com
 * "Invalid URL" em vez de dizer o que falta.
 *
 * POR QUE ISTO EXISTE: a etapa 4 fala de personalização por DISC e o link do
 * kit abria um material GENÉRICO da biblioteca ("Fator C") — exatamente o que a
 * etapa diz não fazer. Aqui sai o relatório que a pessoa recebe de verdade.
 *
 * ⚠️ A persona é do tenant de DEMO (`*.demo@vertho.ai`, dados fictícios). Os
 * relatórios de colaboradores reais NÃO podem virar peça de feira: são PII de
 * cliente, e o material circula em WhatsApp, print e impressão.
 *
 * Os textos vêm do `report_texts` já gerado (LLM) — o script não chama IA. Se a
 * persona não tiver relatório, ele diz isso em vez de inventar: gerar aqui
 * gastaria IA sem ninguém pedir.
 */
import fs from 'node:fs';
import path from 'node:path';

// Carrega .env.local ANTES de qualquer import que leia env (o client do
// Supabase resolve as chaves na chamada, mas o import pode validar no topo).
const LINHAS_ENV = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/) : [];
for (const linha of LINHAS_ENV) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import RelatorioComportamentalPDF from '@/components/pdf/RelatorioComportamental';
import { createSupabaseAdmin } from '@/lib/supabase';
import { CIS_COLUMNS, mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { derivarArquetipo, derivarTagsExecutivas, insightsHardcoded } from '@/lib/disc-arquetipos';

/**
 * Persona de demonstração cujo relatório ilustra a Camada 2 da etapa 4.
 * Default: perfil D, o mesmo do Marcos (o gestor à esquerda do espelho) — o
 * exemplo tem que rimar com quem está na tela.
 *   npx --yes tsx scripts/_conarh-perfil-pdf.ts [email] [arquivo.pdf]
 */
const EMAIL_PERSONA = process.argv[2] || 'carla.demo@vertho.ai';
// Fica junto das outras mídias (`/conarh/media`), de onde a etapa 4 serve.
export const DESTINO = process.argv[3] || 'public/conarh/media/perfil-exemplo-d.pdf';

async function main() {
  const sb = createSupabaseAdmin();

  // Escopo ESTRUTURAL: só tenants de demonstração. O sufixo do e-mail abaixo
  // continua como segunda barreira, mas o filtro no WHERE é o que impede a
  // consulta de alcançar um colaborador real — o app roda service-role, então
  // o banco não recusaria.
  const { data: empresasDemo, error: errEmp } = await sb
    .from('empresas').select('id').eq('is_demo', true);
  if (errEmp) throw new Error(`empresas demo: ${errEmp.message}`);
  const idsDemo = (empresasDemo || []).map((e: { id: string }) => e.id);
  if (!idsDemo.length) throw new Error('nenhuma empresa is_demo — recusando gerar material de tenant real');

  const { data: colab, error } = await sb
    .from('colaboradores')
    // CIS_COLUMNS já é a string do `select` (termina em `.join(', ')`) e JÁ
    // inclui report_texts/report_generated_at. Espalhá-la com `...` mandava
    // cada CARACTERE como uma coluna — o PostgREST devolve um erro de 2 mil
    // caracteres que não parece com "usei o tipo errado".
    .select(`${CIS_COLUMNS}, insights_executivos, email`)
    .in('empresa_id', idsDemo)
    .eq('email', EMAIL_PERSONA)
    .maybeSingle();
  if (error) throw new Error(`consulta falhou: ${error.message}`);
  if (!colab) throw new Error(`persona ${EMAIL_PERSONA} não encontrada`);

  // Guarda dura: o pacote da feira circula. Persona de demo tem e-mail
  // `*.demo@vertho.ai` — qualquer outro seria PII de cliente num PDF público.
  if (!String((colab as any).email || '').endsWith('.demo@vertho.ai')) {
    throw new Error('recusado: só persona de demo pode virar material da feira');
  }

  const texts = (colab as any).report_texts;
  if (!texts) {
    throw new Error(
      `${EMAIL_PERSONA} ainda não tem report_texts. Gere o relatório dela pelo produto ` +
      '(dashboard → perfil comportamental) e rode este script de novo.',
    );
  }

  const raw = mapSupabaseToCISRawData(colab);
  const perfil = (colab as any).perfil_dominante;
  const data = {
    raw,
    texts,
    arquetipo: derivarArquetipo(perfil),
    tags: derivarTagsExecutivas(colab),
    insights: Array.isArray((colab as any).insights_executivos) && (colab as any).insights_executivos.length
      ? (colab as any).insights_executivos
      : insightsHardcoded(perfil),
  };

  const bytes = await renderToBuffer(
    React.createElement(RelatorioComportamentalPDF as never, { data } as never) as never,
  );
  const destino = path.join(process.cwd(), DESTINO);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, Buffer.from(bytes));
  console.log(`OK ${DESTINO} — ${(Buffer.from(bytes).length / 1024) | 0} KB · ${(colab as any).nome_completo} (${perfil})`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
