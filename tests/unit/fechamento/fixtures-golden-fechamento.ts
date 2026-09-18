/**
 * Entradas do golden dos prompts do fechamento (18/09/2026).
 *
 * O golden foi gerado com o código de `92c7f0ae`, ANTES da redação final entrar.
 * Ele prova que o prompt que DÁ A NOTA (scorer) e o do auditor sem arguição
 * continuam byte a byte iguais: a correção muda quem escreve o texto, não a nota.
 * Dados sintéticos (o repositório é público).
 */
import { PROGRAMA_JORNADA, PROGRAMA_PILOTO, PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { reguaTemporalDoPrograma } from '@/lib/season-engine/fechamento-scorer';

const DESCRITORES = [
  {
    descritor: 'Escuta ativa',
    nota_atual: 2.1,
    n1_gap: 'Interrompe e responde antes de entender.',
    n2_desenvolvimento: 'Escuta, mas volta rápido para a própria pauta.',
    n3_meta: 'Confirma o que ouviu antes de propor.',
    n4_referencia: 'Usa o que ouviu para mudar a própria proposta.',
  },
  { descritor: 'Combinados claros', nota_atual: 1.8, n1_gap: 'Sai da conversa sem acordo.', n3_meta: 'Fecha quem faz o quê e até quando.' },
  { descritor: 'Registro da conversa', nota_atual: 2.4 },
];

const BASE = {
  competencia: 'Gestão de Conflitos',
  descritores: DESCRITORES,
  cenario: '## A reunião adiada\n\n**Contexto:** duas áreas disputam a mesma sala.',
  resposta: '[SITUAÇÃO] Pergunta?\n→ Eu ouviria as duas partes.',
  nomeColab: 'COLAB_A1B2',
};

const ACUMULADO = { avaliacao_acumulada: [{ descritor: 'Escuta ativa', nota_acumulada: 2.5 }] };

function regua(config: any) {
  const { semanaFinal, semanasEvidencia, notaPrograma } = reguaTemporalDoPrograma(config);
  return { semanaFinal, semanasEvidencia, notaPrograma };
}

export const CASOS_SCORER = [
  { nome: 'jornada-perfil-D-com-acumulado', params: { ...BASE, perfilDominante: 'D', evidenciasAcumuladas: 'Sem 2: mediou a escala.', acumuladoPrimaria: ACUMULADO, ...regua(PROGRAMA_JORNADA) } },
  { nome: 'jornada-sem-perfil-sem-evidencia', params: { ...BASE, perfilDominante: null, evidenciasAcumuladas: '', acumuladoPrimaria: null, ...regua(PROGRAMA_JORNADA) } },
  { nome: 'regular-duo-perfil-S', params: { ...BASE, perfilDominante: 'S', evidenciasAcumuladas: 'Sem 5: registrou o combinado.', acumuladoPrimaria: null, ...regua(PROGRAMA_REGULAR_DUO) } },
  { nome: 'piloto-perfil-C', params: { ...BASE, perfilDominante: 'C', evidenciasAcumuladas: 'Sem 1: pediu exemplo.', acumuladoPrimaria: null, ...regua(PROGRAMA_PILOTO) } },
  { nome: 'defaults-sem-regua-temporal', params: { ...BASE, perfilDominante: 'I', evidenciasAcumuladas: 'x' } },
];

const AVALIACAO_PRIMARIA = {
  avaliacao_por_descritor: [
    { descritor: 'Escuta ativa', nota_pre: 2.1, nota_pos: 2.6, delta: 0.5, justificativa: 'Confirmou o que ouviu.' },
  ],
  nota_media_pre: 2.1,
  nota_media_pos: 2.6,
  resumo_avaliacao: { mensagem_geral: 'COLAB_A1B2, você ouviu antes de propor.' },
};

export const CASOS_CHECK = [
  { nome: 'jornada', params: { ...BASE, avaliacaoPrimaria: AVALIACAO_PRIMARIA, evidenciasAcumuladas: 'Sem 2: mediou a escala.', ...regua(PROGRAMA_JORNADA) } },
  { nome: 'piloto', params: { ...BASE, avaliacaoPrimaria: AVALIACAO_PRIMARIA, evidenciasAcumuladas: '', ...regua(PROGRAMA_PILOTO) } },
  { nome: 'defaults', params: { ...BASE, avaliacaoPrimaria: AVALIACAO_PRIMARIA } },
];
