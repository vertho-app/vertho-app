import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isValidElement } from 'react';
import { agregarEvolucao, evolucaoParaTela, type TrilhaConcluida, type ParticipanteEvolucao } from '@/lib/relatorios/evolucao-center';
import RelatorioEvolucaoPDF, { textoDosNiveis } from '@/components/pdf/RelatorioEvolucao';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { semComentarios } from '../helpers/fonte';

/**
 * O RH vê NÍVEL de partida, NÍVEL de chegada e AVANÇO por pessoa, em ordem
 * alfabética, e nenhuma nota decimal (R-32, decisão 1 da revisão de 02/10/2026).
 *
 * Antes: a aba Evolução da central e o PDF executivo mostravam, por pessoa nomeada,
 * as colunas "Início" e "Fechamento" com a nota de cada uma, "de 2,1 para 2,5" por
 * competência e por comportamento, e a lista ordenada pelo avanço (um ranking de
 * gente). O dado em si ia inteiro ao navegador, porque a central é um Server
 * Component que passa o painel ao componente de cliente.
 */

const participantes: ParticipanteEvolucao[] = [
  { id: 'p1', nome_completo: 'Ana Souza', cargo: 'Coordenadora', area_depto: 'Pedagógico' },
  { id: 'p2', nome_completo: 'Bruno Lima', cargo: 'Diretor', area_depto: 'Gestão' },
  { id: 'p3', nome_completo: 'Carla Dias', cargo: 'Coordenadora', area_depto: 'Pedagógico' },
];

const trilha = (colaborador_id: string, pre: number, pos: number): TrilhaConcluida => ({
  colaborador_id,
  competencia_foco: 'Planejamento',
  evolution_generated_at: '2026-08-20T12:00:00Z',
  evolution_report: {
    descritores: [{
      competencia: 'Planejamento', descritor: 'Metas', nota_pre: pre, nota_pos: pos,
      convergencia: CONVERGENCIA.PARCIAL, depois: 'trecho',
    }],
  },
});

// Carla avançou MUITO, Ana pouco, Bruno nada: o ranking antigo poria Carla, Ana, Bruno.
const centro = () => agregarEvolucao(
  [trilha('p1', 2.0, 2.3), trilha('p2', 3.0, 3.0), trilha('p3', 1.5, 3.6)],
  participantes,
  0,
);

/** O texto do PDF na ordem em que vai para o papel, lido da árvore (sem renderizar, sem rede). */
function textos(no: any, out: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return out;
  if (typeof no === 'string' || typeof no === 'number') { out.push(String(no)); return out; }
  if (Array.isArray(no)) { for (const n of no) textos(n, out); return out; }
  if (isValidElement(no)) {
    const { type, props } = no as any;
    return typeof type === 'function' ? textos(type(props), out) : textos(props?.children, out);
  }
  return out;
}

describe('ordem da lista nominal: alfabética, nunca pelo avanço', () => {
  it('a lista geral sai por nome', () => {
    expect(centro().pessoas.map((p) => p.nome)).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Dias']);
  });

  it('o recorte por cargo também', () => {
    const coordenadoras = centro().porCargo.find((c) => c.cargo === 'Coordenadora')!;
    expect(coordenadoras.pessoas.map((p) => p.nome)).toEqual(['Ana Souza', 'Carla Dias']);
  });

  it('a pauta de conversas (avanço 0,0) também sai por nome', () => {
    const r = agregarEvolucao(
      [trilha('p3', 2.0, 2.0), trilha('p1', 2.0, 2.0), trilha('p2', 3.0, 3.0)],
      participantes,
      0,
    );
    expect(r.proximasAcoes.precisamApoio.map((p) => p.nome)).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Dias']);
    expect(r.porCargo.find((c) => c.cargo === 'Coordenadora')!.proximasAcoes.precisamApoio.map((p) => p.nome))
      .toEqual(['Ana Souza', 'Carla Dias']);
  });

  it('a mesma pessoa em duas competências fica junta, por competência', () => {
    const duo: TrilhaConcluida = {
      ...trilha('p1', 2, 2.5),
      evolution_report: {
        descritores: [
          { competencia: 'Planejamento', descritor: 'Metas', nota_pre: 2, nota_pos: 2.5, convergencia: null },
          { competencia: 'Colaboração', descritor: 'Rede', nota_pre: 2, nota_pos: 2.5, convergencia: null },
        ],
      },
    };
    const r = agregarEvolucao([duo, trilha('p2', 2, 3)], participantes, 0);
    expect(r.pessoas.map((p) => `${p.nome}/${p.competencia}`)).toEqual([
      'Ana Souza/Colaboração', 'Ana Souza/Planejamento', 'Bruno Lima/Planejamento',
    ]);
  });
});

describe('nível de partida e de chegada por pessoa', () => {
  it('sai da média de cada competência, pela régua oficial, e o de chegada nunca cai', () => {
    const r = centro();
    const por = (nome: string) => r.pessoas.find((p) => p.nome === nome)!;

    expect(por('Ana Souza')).toMatchObject({ nivelPre: 2, nivelPos: 2, delta: 0.3 });
    expect(por('Carla Dias')).toMatchObject({ nivelPre: 1, nivelPos: 4, delta: 2.1 });
    // Queda: a régua não afirma regressão, o nível de chegada é o de partida.
    const queda = agregarEvolucao([trilha('p1', 3.2, 2.1)], participantes, 0).pessoas[0];
    expect(queda).toMatchObject({ nivelPre: 3, nivelPos: 3, delta: 0 });
  });
});

describe('o painel que vai ao navegador não leva nota decimal', () => {
  const profundo = (valor: unknown, achados: string[] = [], caminho = ''): string[] => {
    if (Array.isArray(valor)) valor.forEach((v, i) => profundo(v, achados, `${caminho}[${i}]`));
    else if (valor && typeof valor === 'object') {
      for (const [k, v] of Object.entries(valor)) {
        if (['mediaPre', 'mediaPos', 'notaPre', 'notaPos'].includes(k)) achados.push(`${caminho}.${k}`);
        profundo(v, achados, `${caminho}.${k}`);
      }
    }
    return achados;
  };

  it('o painel completo TEM as médias (o PDF e o radar leem no servidor)…', () => {
    expect(profundo(centro()).length).toBeGreaterThan(0);
  });

  it('…e a projeção para a tela não tem nenhuma, em nenhum nível', () => {
    expect(profundo(evolucaoParaTela(centro()))).toEqual([]);
  });

  it('a projeção mantém nível, avanço, cobertura e resumo, e não muta o painel', () => {
    const completo = centro();
    const copia = JSON.parse(JSON.stringify(completo));
    const tela = evolucaoParaTela(completo);

    expect(completo).toEqual(copia);
    expect(tela.cobertura).toEqual(completo.cobertura);
    expect(tela.resumo).toEqual(completo.resumo);
    expect(tela.pessoas.map((p) => [p.nome, p.nivelPre, p.nivelPos, p.delta]))
      .toEqual(completo.pessoas.map((p) => [p.nome, p.nivelPre, p.nivelPos, p.delta]));
    expect(tela.porCompetencia[0]).toMatchObject({ nivelPre: completo.porCompetencia[0].nivelPre, delta: completo.porCompetencia[0].delta });
  });

  it('a central entrega ao cliente a projeção, não o painel inteiro', () => {
    const fonte = semComentarios(readFileSync('lib/relatorios/rh-center.ts', 'utf8'));
    expect(fonte).toContain('evolucao: evolucaoParaTela(evolucao)');
  });
});

describe('PDF executivo: nível e avanço, sem a média das notas', () => {
  const pdf = () => textos(RelatorioEvolucaoPDF({ data: centro(), empresaNome: 'Empresa Teste', mostrarVertho: true } as any)).join('\n');

  it('as colunas são Partida e Chegada, em nível (não Antes e Depois, com a nota)', () => {
    const t = pdf();
    expect(t).toContain('Partida');
    expect(t).toContain('Chegada');
    expect(t).not.toMatch(/\bAntes\b|\bDepois\b/);
  });

  it('nenhum "de X para Y" com nota, em lugar nenhum do papel', () => {
    const t = pdf();
    expect(t).not.toMatch(/de \d,\d para \d,\d/);
    expect(t).not.toMatch(/\d,\d para \d,\d/);
    expect(t).not.toMatch(/ponto na régua/);
  });

  it('a tabela nominal sai em ordem alfabética dentro do cargo', () => {
    const t = pdf();
    const secao = t.slice(t.indexOf('Pessoa por pessoa'));
    expect(secao.indexOf('Ana Souza')).toBeGreaterThan(-1);
    expect(secao.indexOf('Ana Souza')).toBeLessThan(secao.indexOf('Carla Dias'));
  });

  it('a linha de cada pessoa tem nível de partida, de chegada e avanço, nessa ordem', () => {
    const t = pdf();
    const secao = t.slice(t.indexOf('Pessoa por pessoa'));
    // Carla: 1,5 para 3,6 vira N1 e N4, avanço +2,1. Nenhuma das duas notas vai ao papel.
    expect(secao).toContain('Carla Dias\nCoordenadora\nPlanejamento\nN1\nN4\n+2,1');
    expect(secao).toContain('Ana Souza\nCoordenadora\nPlanejamento\nN2\nN2\n+0,3');
    expect(secao).not.toMatch(/\b1,5\b|\b3,6\b|\b2,3\b/);
  });

  it('textoDosNiveis: subiu mostra de e para, manteve mostra só o nível', () => {
    expect(textoDosNiveis(2, 3)).toBe('N2 para N3');
    expect(textoDosNiveis(3, 3)).toBe('N3');
  });
});

describe('a aba Evolução da central não imprime nota', () => {
  const VIEW = semComentarios(readFileSync('app/dashboard/relatorios/relatorios-rh-view.tsx', 'utf8'));

  it('sem toFixed (nenhum número com casas decimais sai da tela)', () => {
    expect(VIEW).not.toContain('toFixed');
  });

  it('o avanço e o nível passam pelas funções únicas', () => {
    expect(VIEW).toContain('formatarValorAvanco(pessoa.delta)');
    expect(VIEW).toContain("t('dashboard.evolution.level', { nivel: pessoa.nivelPre })");
    expect(VIEW).toContain("t('dashboard.evolution.level', { nivel: pessoa.nivelPos })");
  });

  it('não pinta variação negativa em âmbar: a evolução é só avanço', () => {
    expect(VIEW).not.toMatch(/delta < 0|deltaMedio >= 0 \? '#34D399' : '#FBBF24'/);
  });
});
