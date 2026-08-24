// Todo cron agendado no `vercel.json` tem que existir no handler — e o inverso
// importa menos, mas a ausência é cara.
//
// 🔴 POR QUE ESTE GUARD (17/08/2026): a Vercel chama a URL agendada e o handler
// responde **400 "Action desconhecida"**. Do lado do painel isso aparece como uma
// invocação que aconteceu; do lado do produto, o trabalho simplesmente não roda.
// Um cron fantasma é indistinguível de um cron que rodou e não achou nada —
// exatamente a ambiguidade que os checks desta base existem para eliminar.
//
// O gatilho concreto foi mover o pós-voo da entrega para um agendamento próprio:
// bastava errar o nome da `action` num dos dois arquivos para o alarme de entrega
// deixar de rodar, e o sintoma seria silêncio.
import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { ACOES_SO_MANUAIS } from '@/app/api/cron/route';

const vercelJson = JSON.parse(readFileSync('vercel.json', 'utf-8'));
const handler = readFileSync('app/api/cron/route.ts', 'utf-8');

/** `action` de cada path agendado que aponta para /api/cron. */
function acoesAgendadas(): string[] {
  const crons: { path: string }[] = vercelJson.crons || [];
  return crons
    .filter((c) => c.path.startsWith('/api/cron'))
    .map((c) => new URL(c.path, 'https://x').searchParams.get('action'))
    .filter(Boolean) as string[];
}

/** `case 'x':` do switch do handler. */
function acoesTratadas(): Set<string> {
  return new Set([...handler.matchAll(/case\s+'([a-z0-9_-]+)'\s*:/gi)].map((m) => m[1]));
}

describe('cron agendado ↔ handler', () => {
  it('há crons agendados (senão este guard não prova nada)', () => {
    expect(acoesAgendadas().length).toBeGreaterThan(5);
  });

  it('🔴 toda action agendada tem case no handler', () => {
    const tratadas = acoesTratadas();
    const fantasmas = acoesAgendadas().filter((a) => !tratadas.has(a));
    expect(fantasmas, `agendado no vercel.json e sem case em app/api/cron/route.ts: ${fantasmas.join(', ')}`).toEqual([]);
  });

  it('o pós-voo da entrega roda DEPOIS do disparo, não junto', () => {
    // A regra é de produto, não de estilo: o `trigger_diario` é um dispatcher
    // (fan-out por empresa), então medir a entrega no mesmo minuto do disparo
    // produz "nenhum canal saiu" com as mensagens em voo (medido 03/08 e 17/08).
    const crons: { path: string; schedule: string }[] = vercelJson.crons || [];
    const minuto = (s: string) => Number(s.split(' ')[0]);
    const hora = (s: string) => s.split(' ')[1];

    const disparo = crons.find((c) => c.path.includes('trigger_diario'));
    const posVoo = crons.find((c) => c.path.includes('postflight_entrega'));
    expect(disparo, 'trigger_diario precisa estar agendado').toBeTruthy();
    expect(posVoo, 'postflight_entrega precisa estar agendado').toBeTruthy();
    expect(hora(posVoo!.schedule)).toBe(hora(disparo!.schedule));
    expect(minuto(posVoo!.schedule) - minuto(disparo!.schedule)).toBeGreaterThanOrEqual(30);
  });

  /**
   * ── O lado que faltava (D10 da auditoria de 22/08) ────────────────────────
   *
   * O guard só olhava `vercel.json → handler`. O buraco estava no sentido
   * inverso: um case podia existir sem agendamento nenhum e nada dizia isso.
   * Foi assim que o cabeçalho do arquivo documentou 3 actions de 15, DUAS delas
   * sem cron, e ninguém percebeu por meses — o custo aparece quando alguém
   * investiga "o cron não rodou" e acredita no que está escrito ali.
   *
   * Agora todo case tem que declarar um lado: agendado no `vercel.json`, ou
   * listado em `ACOES_SO_MANUAIS`.
   */
  it('🔴 todo case do handler ou está agendado, ou está declarado como manual', () => {
    const agendadas = new Set(acoesAgendadas());
    const manuais = new Set<string>(ACOES_SO_MANUAIS);

    const orfas = [...acoesTratadas()].filter((a) => !agendadas.has(a) && !manuais.has(a));

    expect(
      orfas,
      'case sem cron e sem declaração: se é manual, entre em ACOES_SO_MANUAIS (com o motivo); '
      + 'se devia rodar sozinho, falta a entrada no vercel.json — e o sintoma seria silêncio',
    ).toEqual([]);
  });

  it('🔴 nada em `ACOES_SO_MANUAIS` está agendado (senão o comentário mente)', () => {
    const agendadas = new Set(acoesAgendadas());
    const contradicao = [...ACOES_SO_MANUAIS].filter((a) => agendadas.has(a));

    expect(
      contradicao,
      'declarada como manual e agendada no vercel.json ao mesmo tempo — alguém ligou o cron e não tirou daqui',
    ).toEqual([]);
  });

  /**
   * O cabeçalho não repete horário: `vercel.json` é a fonte. Uma tabela de
   * horários aqui envelhece calada — e a que existia estava com UTC e BRT
   * TROCADOS nas três linhas, mandando quem depura procurar 3 h fora da janela.
   */
  it('🔴 o cabeçalho do handler não enumera horário de agendamento', () => {
    const cabecalho = handler.slice(0, handler.indexOf('export async function GET'));
    // Um horário concreto seguido de fuso é o padrão que envelhece: "05:00 UTC".
    const horarios = [...cabecalho.matchAll(/\b\d{1,2}:\d{2}\s*(UTC|BRT)\b/gi)].map((m) => m[0]);

    expect(
      horarios,
      'horário literal no cabeçalho: os horários vivem no vercel.json, e uma cópia aqui envelhece calada '
      + '(a que existia trocava UTC por BRT nas três linhas)',
    ).toEqual([]);
  });
});
