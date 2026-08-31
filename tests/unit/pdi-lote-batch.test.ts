import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O PDI em lote (31/08/2026) — guard estrutural das três coisas que, se
 * quebrarem, não param nada e ninguém percebe.
 *
 * Estático de propósito, mesmo padrão de `p2-semana-pendente`: montar a task do
 * Trigger com batch, Supabase e @react-pdf custaria mais que os defeitos que
 * ele pega, e nenhum deles é de tipo.
 */

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
/** Só o CÓDIGO: comentário explica o contrário do que faz e vira falso verde. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const TASK = semComentarios(ler('trigger/gerar-relatorios-batch.ts'));
const ACTION = semComentarios(ler('actions/ia-pipeline-batch.ts'));
const CORE = semComentarios(ler('lib/relatorios/individual-core.ts'));

describe('ledger: o lote não pode virar custo órfão', () => {
  /**
   * A etiqueta do batch tem que ser a MESMA do caminho síncrono. Sem isso o
   * lote, que passa a ser o caminho padrão, cai como `feature: 'batch'` e o
   * custo do PDI fica sem dono — a classe do "ledger só cobre quem passa pelo
   * wrapper", agora por dentro do wrapper.
   */
  it('o batch é etiquetado como pdi_individual, igual ao síncrono', () => {
    expect(TASK).toContain("ledger: { feature: 'pdi_individual'");
    expect(TASK).toContain("taskKey: 'pdi_individual'");
    expect(CORE).toContain("taskKey: 'pdi_individual'");
  });

  it('a retomada procura o batch pendente com a mesma etiqueta', () => {
    // Etiqueta divergente aqui não dá erro: só faz a 2ª fonte da retomada nunca
    // achar nada, e o lote inteiro ser refeito (e repago) no retry.
    expect(TASK).toContain("batchPendenteDoJob(payload.jobId, 'pdi_individual')");
  });
});

describe('pdf_path: entrega pela metade não pode parecer sucesso', () => {
  it('o persist DEVOLVE pdfPath', () => {
    // Sem devolver, a task não tem como distinguir "salvo com PDF" de "salvo
    // com pdf_path null" — foi assim que 40 micro-conteúdos nasceram sem PDF.
    expect(CORE).toContain('return { success: true, pdfPath,');
  });

  it('a task conta quem ficou sem PDF e leva ao resumo final', () => {
    expect(TASK).toContain('const faltouPdf = !!r.success && !r.pdfPath;');
    expect(TASK).toContain('if (faltouPdf) semPdf++;');
    expect(TASK).toContain('SEM PDF');
    expect(TASK).toMatch(/semPdf \? `, \$\{semPdf\} SEM PDF`/);
  });

  it('o resumo distingue os dois estados (ok ≠ ok sem PDF)', () => {
    expect(TASK).toContain("faltouPdf ? 'ok, SEM PDF' : 'ok'");
  });
});

describe('fila: uma implementação só', () => {
  it('a action REUSA gerarRelatoriosIndividuaisLote em vez de remontar a fila', () => {
    // A fila carrega duas regras caras: pula quem já tem relatório (o upsert
    // sobrescreveria PDI entregue) e exige o top5 completo. Uma segunda fila
    // aqui divergiria na primeira correção.
    expect(ACTION).toContain("import { gerarRelatoriosIndividuaisLote } from '@/actions/relatorios';");
    expect(ACTION).toContain('const fila = await gerarRelatoriosIndividuaisLote(empresaId);');
    // E não pode ter reimplementado o filtro por dentro:
    const trecho = ACTION.slice(ACTION.indexOf('export async function enqueueRelatoriosBatch'));
    expect(trecho.slice(0, trecho.indexOf('export async function statusIAJob'))).not.toContain("eq('tipo', 'individual')");
  });

  it('a fase do job e a do guard de duplicata são a MESMA', () => {
    // Fases diferentes = o guard vigia uma gaveta vazia e dois lotes rodam
    // juntos, cada um pagando o mesmo PDI.
    expect(ACTION).toContain("jaTemLoteAtivo(sb, empresaId, 'relatorios')");
    expect(ACTION).toMatch(/fase: 'relatorios',/);
  });
});

describe('o síncrono continua existindo e passa pelo mesmo persist', () => {
  it('gerarRelatorioIndividualCore delega ao persist compartilhado', () => {
    expect(CORE).toContain('return await persistRelatorioIndividualFromText(sbRaw, {');
    // `built` reaproveitado: o síncrono já pagou a leitura E é o que mantém a
    // evidência da auditoria igual ao prompt enviado.
    expect(CORE).toContain('texto: resultado, built,');
  });

  it('o teto de tokens é uma constante única para os dois caminhos', () => {
    expect(CORE).toContain('export const PDI_MAX_TOKENS = 64000;');
    expect(CORE).toContain('PDI_MAX_TOKENS, {');
    // A task não pode ter um número solto: ela usa o `maxTokens` do req.
    expect(TASK).toContain('maxTokens: r.maxTokens');
    expect(TASK).not.toMatch(/maxTokens:\s*\d{4,}/);
  });
});
