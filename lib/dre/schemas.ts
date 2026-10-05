/**
 * Schemas zod das actions da DRE.
 *
 * Server action é endpoint HTTP: o cliente escolhe TODOS os parâmetros, inclusive
 * os que decidem dinheiro. Cada mensagem aqui é escrita para a pessoa que vai
 * lê-la na tela (o envelope devolve a 1ª), e os tetos existem para impedir que um
 * valor absurdo (ou um bug de digitação com três zeros a mais) entre no caixa.
 */

import { z } from 'zod';
import { arredondar2, arredondarHoras } from './dinheiro';
import { ehPrimeiroDiaDoMes } from './rateio';
import { ehDataISO, ehSegunda } from './semana';
import { CATEGORIAS, PERIODICIDADES, STATUS_CONTRATO } from './tipos';

/** Teto de um valor único: R$ 1 bilhão. Acima disso é erro de digitação, não contrato. */
export const TETO_VALOR_BRL = 1_000_000_000;

const id = z.string().uuid('Identificador inválido.');

const data = z.string().refine(ehDataISO, 'Data inválida (use AAAA-MM-DD).');

const segunda = z
  .string()
  .refine(ehDataISO, 'Data inválida (use AAAA-MM-DD).')
  .refine(ehSegunda, 'A semana tem de começar numa segunda-feira.');

/**
 * Dinheiro normalizado A CENTAVO ANTES de validar: o banco guarda `numeric(_,2)`
 * e arredonda sozinho, então 0,004 passaria em "maior que zero" e chegaria ao
 * banco como 0,00 (violando o check). Arredondar primeiro faz a validação olhar
 * o mesmo número que será gravado.
 */
const dinheiro = z
  .number({ error: 'Informe um valor.' })
  .finite('Informe um valor.')
  .max(TETO_VALOR_BRL, 'Valor acima do teto de R$ 1 bilhão: confira os zeros.')
  .transform(arredondar2);

/** Valor em R$ que pode ser zero (contrato grátis é permitido; parcela de R$ 0 também). */
const valorNaoNegativo = dinheiro.refine((v) => v >= 0, 'O valor não pode ser negativo.');

/** Valor em R$ estritamente positivo (lançamento de custo nunca é zero). */
const valorPositivo = dinheiro.refine((v) => v > 0, 'O valor tem de ser maior que zero.');

/** Horas, normalizadas a 2 casas (a precisão da coluna) antes de validar. */
const horasValidas = z
  .number({ error: 'Informe as horas.' })
  .finite('Informe as horas.')
  .max(2_000, 'Mais de 2.000 horas num lançamento: confira.')
  .transform(arredondarHoras)
  .refine((v) => v > 0, 'As horas têm de ser maiores que zero.');

const textoCurto = (max: number, rotulo: string) =>
  z.string().trim().max(max, `${rotulo}: no máximo ${max} caracteres.`);

export const SchemaListarOrcamentos = z.object({}).strict();

export const SchemaCriarContrato = z.object({
  empresaId: id,
  nome: textoCurto(120, 'Nome do contrato').min(1, 'Dê um nome ao contrato.'),
  valorTotalBrl: valorNaoNegativo,
  inicio: data,
  orcamentoId: id.nullable().optional(),
  /** Gera o calendário de parcelas junto. `null` = só o contrato, parcelas depois. */
  parcelas: z
    .object({
      n: z.number().int('Número de parcelas inválido.').min(1, 'Informe ao menos 1 parcela.').max(120, 'No máximo 120 parcelas.'),
      primeiroVencimento: data,
    })
    .nullable()
    .optional(),
});

export const SchemaAtualizarContrato = z.object({
  id,
  nome: textoCurto(120, 'Nome do contrato').min(1, 'Dê um nome ao contrato.').optional(),
  valorTotalBrl: valorNaoNegativo.optional(),
  inicio: data.optional(),
  status: z.enum(STATUS_CONTRATO, { error: 'Status inválido.' }).optional(),
});

export const SchemaExcluirContrato = z.object({ id });

export const SchemaRegerarParcelas = z.object({
  contratoId: id,
  n: z.number().int('Número de parcelas inválido.').min(1, 'Informe ao menos 1 parcela.').max(120, 'No máximo 120 parcelas.'),
  primeiroVencimento: data,
});

export const SchemaRegistrarRecebimento = z.object({
  parcelaId: id,
  recebidoEm: data,
  valorRecebidoBrl: valorPositivo,
  notaFiscal: textoCurto(60, 'Nota fiscal').nullable().optional(),
});

export const SchemaDesfazerRecebimento = z.object({ parcelaId: id });

export const SchemaAtualizarParcela = z.object({
  id,
  vencimento: data.optional(),
  valorPrevistoBrl: valorNaoNegativo.optional(),
  observacao: textoCurto(300, 'Observação').nullable().optional(),
  notaFiscal: textoCurto(60, 'Nota fiscal').nullable().optional(),
});

export const SchemaAdicionarParcela = z.object({
  contratoId: id,
  vencimento: data,
  valorPrevistoBrl: valorNaoNegativo,
});

export const SchemaExcluirParcela = z.object({ id });

/** O mês de um lançamento mensal: sempre o dia 1 ('2026-09-01'). */
const primeiroDoMes = z
  .string()
  .refine(ehDataISO, 'Mês inválido (use AAAA-MM-01).')
  .refine(ehPrimeiroDiaDoMes, 'O mês tem de ser informado pelo dia 1 (AAAA-MM-01).');

export const SchemaSalvarLancamento = z
  .object({
    /** Presente = edita. Ausente = cria. */
    id: id.nullable().optional(),
    escopo: z.enum(['empresa', 'plataforma'], { error: 'Escolha empresa ou plataforma.' }),
    empresaId: id.nullable().optional(),
    /** Ausente = semanal (o contrato anterior à mig 280). */
    periodicidade: z.enum(PERIODICIDADES, { error: 'Escolha semanal ou mensal.' }).optional(),
    /** Só no semanal: a segunda-feira da competência. */
    semanaInicio: segunda.nullable().optional(),
    /** Só no mensal: o dia 1 do mês, rateado pelas semanas por dia. */
    mesCompetencia: primeiroDoMes.nullable().optional(),
    categoria: z.enum(CATEGORIAS, { error: 'Categoria inválida.' }),
    descricao: textoCurto(300, 'Descrição').nullable().optional(),
    /** Só para `horas`: o valor é horas × custo/hora, calculado no servidor. */
    horas: horasValidas.nullable().optional(),
    custoHoraBrl: valorNaoNegativo.nullable().optional(),
    responsavel: textoCurto(80, 'Responsável').nullable().optional(),
    /** Para as demais categorias. Ignorado em `horas`. */
    valorBrl: valorPositivo.nullable().optional(),
  })
  // Coerência do período: o mensal exige o mês, o semanal exige a semana. O banco
  // também recusa a combinação (`dre_lancamentos_periodo_coerente`), mas a mensagem
  // que a pessoa lê vem daqui.
  .superRefine((v, ctx) => {
    if (v.periodicidade === 'mensal') {
      if (!v.mesCompetencia) ctx.addIssue({ code: 'custom', path: ['mesCompetencia'], message: 'Escolha o mês do custo.' });
    } else if (!v.semanaInicio) {
      ctx.addIssue({ code: 'custom', path: ['semanaInicio'], message: 'Escolha a semana do custo.' });
    }
  });

export const SchemaExcluirLancamento = z.object({ id });

export const SchemaDefinirCambio = z.object({
  semanaInicio: segunda,
  usdBrl: z
    .number({ error: 'Informe a cotação.' })
    .finite('Informe a cotação.')
    // Faixa de sanidade: pega vírgula no lugar errada (52,1 em vez de 5,21).
    .gt(1, 'Cotação implausível (abaixo de R$ 1 por dólar).')
    .lt(20, 'Cotação implausível (acima de R$ 20 por dólar): confira a vírgula.')
    // 4 casas: a precisão da coluna (`numeric(8,4)`).
    .transform((v) => Math.round(v * 10_000) / 10_000),
});

export const SchemaRecalcularSemana = z.object({ semanaInicio: segunda });
