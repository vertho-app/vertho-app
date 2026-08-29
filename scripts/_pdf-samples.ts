/**
 * INTERNO / não-versionar: gera amostras de TODOS os PDFs do app com dados
 * fictícios, pra padronização de look-and-feel. Salva em ~/Downloads/vertho-pdf-samples.
 * Rodar de nextjs-app:  npx --yes tsx scripts/_pdf-samples.ts [filtro]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = (process.env.PDF_OUT || path.join(os.homedir(), 'Downloads', 'vertho-pdf-samples'));
fs.mkdirSync(OUT, { recursive: true });

const filtro = process.argv[2] || '';
type Job = { nome: string; run: () => Promise<Uint8Array | Buffer> };
const jobs: Job[] = [];
const add = (nome: string, run: Job['run']) => jobs.push({ nome, run });

async function save(nome: string, bytes: Uint8Array | Buffer) {
  const p = path.join(OUT, `${nome}.pdf`);
  fs.writeFileSync(p, Buffer.from(bytes));
  const kb = (Buffer.from(bytes).length / 1024).toFixed(0);
  console.log(`  ✔ ${nome}.pdf (${kb} KB)`);
}

// ───────────────────────── PLENÁRIA (Helvetica, sem CDN/logo) ─────────────────
add('15-plenaria-equipe', async () => {
  const { renderPlenariaEquipePDF } = await import('@/lib/plenaria-equipe-pdf');
  const rows = [
    { colab: 'Ana Prado', cargo: 'Analista Pleno', competencia: 'Comunicacao Assertiva', status: 'evolucao_confirmada', delta: 0.9, mediaPre: 2.1, mediaPos: 3.0 },
    { colab: 'Bruno Lima', cargo: 'Coordenador', competencia: 'Gestao de Conflitos', status: 'evolucao_parcial', delta: 0.4, mediaPre: 2.4, mediaPos: 2.8 },
    { colab: 'Carla Mota', cargo: 'Analista Junior', competencia: 'Organizacao', status: 'em_andamento', mediaPre: 2.0, mediaPos: 2.0 },
    { colab: 'Diego Ramos', cargo: 'Especialista', competencia: 'Pensamento Analitico', status: 'estagnacao', delta: 0.0, mediaPre: 2.6, mediaPos: 2.6 },
    { colab: 'Elena Souza', cargo: 'Analista Pleno', competencia: 'Foco em Resultado', status: 'regressao', delta: -0.3, mediaPre: 3.1, mediaPos: 2.8 },
    { colab: 'Felipe Nunes', cargo: 'Estagiario', competencia: '-', status: 'sem_trilha', mediaPre: 0, mediaPos: 0 },
  ];
  return renderPlenariaEquipePDF({
    gestorNome: 'Mariana Alves',
    empresa: 'Acme Educacao (ficticio)',
    eyebrow: 'Plenaria da Equipe',
    responsavelLabel: 'Gestora',
    resumo: { total: 6, evolucaoConfirmada: 1, evolucaoParcial: 1, emAndamento: 1, estagnacao: 1, regressao: 1, semTrilha: 1 },
    rows,
  });
});

// ───────────────────────────────── runner ────────────────────────────────────
(async () => {
  console.log(`Saida: ${OUT}\n`);
  const alvo = jobs.filter((j) => !filtro || j.nome.includes(filtro));
  for (const j of alvo) {
    try {
      const bytes = await j.run();
      await save(j.nome, bytes);
    } catch (e: any) {
      console.error(`  ✗ ${j.nome}: ${e?.message || e}`);
      if (process.env.DEBUG) console.error(e?.stack);
    }
  }
  console.log(`\nFeito: ${alvo.length} tentativa(s).`);
})();
