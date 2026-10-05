/**
 * Os 18 PDFs de demonstração do pacote offline não contradizem o produto (R-136, 05/10/2026).
 *
 * Eles estão versionados em `lib/demo/offline/documents/<ambiente>/`, o build os copia para
 * `public/apresentacao-offline*` e os representantes os abrem com leads. Foram feitos antes das
 * correções de 02 a 05/10 e diziam "Uma jornada de 14 semanas", "Resumo de Desempenho", "candidatos
 * elegíveis" e nota decimal; 12 dos 18 nem tinham script. Agora um comando os regera com os
 * renderizadores atuais (`node scripts/gerar-pdfs-demo-offline.mts`), e este guard LÊ O TEXTO dos
 * arquivos versionados: o que sai no papel é o que vale, não o código que o gerou.
 *
 * Por que o texto do PDF e não a fonte do componente: o defeito de R-136 não estava no componente,
 * estava no ARQUIVO velho que ninguém regerava. Só o arquivo prova o que o lead vai ler.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extractText, getDocumentProxy } from 'unpdf';
import { AMBIENTES_OFFLINE, nomesDosDocumentos } from '@/lib/demo/offline/documentos';

type Veto = { id: string; re: RegExp; motivo: string; /** Também procura no texto sem espaços (título com espaçamento entre letras). */ compacto?: boolean };

/** Vale para os 18. */
const VETOS_GERAIS: Veto[] = [
  { id: '14 semanas', re: /\b14 semanas\b/i, compacto: true, motivo: 'o programa que roda é a Jornada de 7 semanas (R-26, R-28)' },
  { id: 'Resumo de Desempenho', re: /Resumo de Desempenho/i, compacto: true, motivo: 'o PDI mostra o ponto de partida por competência, sem rótulo de desempenho (R-38)' },
  { id: 'nota decimal "N,N de 4"', re: /\b\d[.,]\d{1,2}\s*(?:de|\/)\s*4\b/i, motivo: 'ninguém do cliente vê nota decimal (decisão 1)' },
  { id: 'nota decimal "Nota N,N"', re: /\bnota\s+\d[.,]\d/i, motivo: 'ninguém do cliente vê nota decimal (decisão 1)' },
  { id: 'média decimal', re: /m[ée]dia(?:\s+geral)?\s*(?:de|:)?\s*\d[.,]\d/i, motivo: 'o cliente vê nível mais frequente, nunca média (R-32, R-36)' },
  { id: 'Pulso', re: /\bPulso\b/, motivo: 'bloco off-line (lib/blocos-offline.ts)' },
  { id: 'Plenária', re: /Plen[áa]ria/i, compacto: true, motivo: 'não é relatório da plataforma (decisão 4)' },
  { id: 'Dossiê', re: /Dossi[êe]/i, compacto: true, motivo: 'não é relatório da plataforma (decisão 4)' },
  { id: 'travessão', re: /[—―]|\s–\s/, motivo: 'a regra de voz é sem travessão (intervalo "0–100" é outra coisa e passa)' },
  { id: 'Temporada', re: /\bTemporada\b/i, motivo: 'a unidade de 7 semanas se chama Jornada (R-52)' },
  { id: 'Ranking de Atenção', re: /Ranking de Aten[çc][ãa]o/i, motivo: 'o gestor vê pontos de atenção em ordem alfabética, sem ranking (R-36)' },
  { id: 'Atenção Prioritária', re: /Aten[çc][ãa]o Priorit[áa]ria/i, motivo: 'o selo virou "Prioridade" (R-38)' },
];

/** O Ranking de Adequação é produto, não o módulo de Seleção (decisão 2, R-34): só os ranking-N. */
const VETOS_DO_RANKING: Veto[] = [
  { id: 'candidato', re: /candidat/i, compacto: true, motivo: 'vocabulário da Seleção (off-line)' },
  { id: 'elegível', re: /eleg[ií]ve[il]s?/i, compacto: true, motivo: 'vocabulário da Seleção (off-line); no engajamento "elegíveis" é outra coisa e é do produto' },
  { id: 'corte de recomendação', re: /corte de recomenda/i, compacto: true, motivo: 'frase da capa que o R-136 cita como formato de Seleção' },
  { id: 'eliminatório', re: /elimin/i, motivo: 'a pessoa fica fora do ranking por requisito essencial' },
  { id: 'entrevista', re: /entrevista/i, motivo: 'vocabulário de recrutamento' },
  { id: 'psicólogo', re: /psic[óo]log/i, motivo: 'a decisão final cabe ao gestor ou ao RH' },
  { id: 'vaga', re: /\bvagas?\b/i, motivo: 'vocabulário de recrutamento' },
];

function achados(texto: string, vetos: Veto[]): string[] {
  const compacto = texto.replace(/\s+/g, '');
  const saida: string[] = [];
  for (const veto of vetos) {
    const achado = veto.re.exec(texto);
    // O texto do PDF vem numa linha só: o trecho em volta do achado é o que diz onde olhar.
    if (achado) saida.push(`${veto.id} (${veto.motivo}): "...${texto.slice(Math.max(0, achado.index - 40), achado.index + 60).replace(/\s+/g, ' ')}..."`);
    else if (veto.compacto && veto.re.test(compacto)) saida.push(`${veto.id} em texto espaçado (${veto.motivo})`);
  }
  return saida;
}

const versionados = (): Array<{ tenant: string; arquivo: string; caminho: string }> =>
  execFileSync('git', ['ls-files', '--', 'lib/demo/offline/documents'], { encoding: 'utf8' })
    .split(/\r?\n/).filter((caminho) => caminho.endsWith('.pdf'))
    .map((caminho) => {
      const [, , , , tenant, arquivo] = caminho.split('/');
      return { tenant, arquivo, caminho };
    });

describe('PDFs de demonstração do pacote offline (R-136)', () => {
  const pdfs = versionados();
  const textos = new Map<string, string>();

  beforeAll(async () => {
    for (const { caminho } of pdfs) {
      const pdf = await getDocumentProxy(new Uint8Array(readFileSync(caminho)));
      const { text } = await extractText(pdf, { mergePages: true });
      textos.set(caminho, text);
    }
  }, 120_000);

  it('são exatamente os 18 que o pacote espera, nem um a mais nem a menos (todo PDF tem gerador)', () => {
    const esperados = AMBIENTES_OFFLINE.flatMap((tenant) => nomesDosDocumentos(tenant).map((arquivo) => `${tenant}/${arquivo}`)).sort();
    expect(esperados).toHaveLength(18);
    expect(pdfs.map((p) => `${p.tenant}/${p.arquivo}`).sort()).toEqual(esperados);
  });

  it('todo PDF tem texto extraível (um PDF em branco passaria por qualquer veto)', () => {
    for (const { caminho } of pdfs) {
      expect(textos.get(caminho)?.trim().length ?? 0, caminho).toBeGreaterThan(400);
    }
  });

  it('nenhum dos 18 traz 14 semanas, Resumo de Desempenho, nota decimal, Pulso, Plenária, Dossiê, travessão nem vocabulário antigo', () => {
    const problemas = pdfs.flatMap(({ tenant, arquivo, caminho }) =>
      achados(textos.get(caminho) ?? '', VETOS_GERAIS).map((a) => `${tenant}/${arquivo}: ${a}`));
    expect(problemas).toEqual([]);
  });

  it('os ranking-N falam do Ranking de Adequação, sem candidato, elegível, corte de recomendação nem eliminatório', () => {
    const rankings = pdfs.filter((p) => /^ranking-\d+\.pdf$/.test(p.arquivo));
    expect(rankings).toHaveLength(6);
    const problemas = rankings.flatMap(({ tenant, arquivo, caminho }) =>
      achados(textos.get(caminho) ?? '', VETOS_DO_RANKING).map((a) => `${tenant}/${arquivo}: ${a}`));
    expect(problemas).toEqual([]);
  });

  it('o PDI de cada ambiente diz 7 semanas e é da persona certa', () => {
    const esperado: Record<string, { nome: string }> = { 'acme-demo': { nome: 'Bruna Costa' }, 'escolas-acme': { nome: 'Marina Rocha' } };
    for (const [tenant, { nome }] of Object.entries(esperado)) {
      const texto = textos.get(`lib/demo/offline/documents/${tenant}/pdi.pdf`) ?? '';
      expect(texto, `${tenant} PDI: nome`).toContain(nome);
      expect(texto, `${tenant} PDI: duração`).toMatch(/jornada de 7 semanas/i);
      expect(texto, `${tenant} PDI: ponto de partida`).toContain('Ponto de partida por competência');
    }
  });

  // O scanner só vale se souber falhar: cada veto dispara num texto que o contém e fica quieto no texto limpo.
  it('o scanner acusa cada veto num texto que o contém e não acusa um texto limpo', () => {
    const sujos: Record<string, string> = {
      '14 semanas': 'Uma jornada de 14 semanas de aprendizagem',
      'Resumo de Desempenho': 'Resumo de Desempenho',
      'nota decimal "N,N de 4"': 'Média 2,5 de 4',
      'nota decimal "Nota N,N"': 'Nota 1,78. Perfil semelhante',
      'média decimal': 'média geral de 2,51',
      Pulso: 'Relatório do Pulso',
      'Plenária': 'Plenária da Equipe',
      'Dossiê': 'Dossiê do colaborador',
      'travessão': 'esta pausa — não pode',
      Temporada: 'TEMPORADA 1 CONCLUÍDA',
      'Ranking de Atenção': 'Ranking de Atenção',
      'Atenção Prioritária': 'Atenção Prioritária',
    };
    for (const veto of VETOS_GERAIS) {
      expect(achados(sujos[veto.id], [veto]).length, `veto "${veto.id}" não disparou`).toBe(1);
    }
    const sujosRanking: Record<string, string> = {
      candidato: 'Aderência dos 7 candidatos',
      'elegível': 'candidatos elegíveis',
      'corte de recomendação': 'acima do corte de recomendação',
      'eliminatório': 'requisito eliminatório',
      entrevista: 'validar na entrevista',
      'psicólogo': 'gestor ou psicólogo responsável',
      vaga: 'a vaga em aberto',
    };
    for (const veto of VETOS_DO_RANKING) {
      expect(achados(sujosRanking[veto.id], [veto]).length, `veto "${veto.id}" não disparou`).toBe(1);
    }
    // título com espaçamento entre as letras ("C A N D I D A T O") também é pego
    expect(achados('C A N D I D A T O S', VETOS_DO_RANKING).length).toBe(1);
    // o que o produto escreve e passa: intervalo com travessão médio, avanço, nível, aderência em %
    const limpo = 'Faixa 41–80 (0–100). Avanço +0,3. Nível 2 de 4 níveis. Aderência 96,0%. Elegíveis 16 · 100% da base (engajamento).';
    expect(achados(limpo, VETOS_GERAIS)).toEqual([]);
  });
});
