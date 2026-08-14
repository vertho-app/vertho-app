/**
 * Evidência de quinta multicanal (mig 213, 14/08/2026).
 *
 * O QUE ESTE ARQUIVO PROTEGE
 * ──────────────────────────
 * 1. **O avanço de semana não pode acontecer duas vezes no mesmo dia.** O gate de
 *    entrada da evidência passou a ser POR CANAL, justamente para recuperar o
 *    canal que falhou numa segunda passada. Sem o guarda em
 *    `ultima_evidencia_em`, essa segunda passada avançaria `semana_atual` de
 *    novo — a pessoa pularia uma semana inteira de conteúdo, e ninguém veria.
 *
 * 2. **A copy do e-mail é a mesma do template aprovado da Meta.** Canal diferente
 *    com promessa diferente é como o produto começa a se contradizer — e a copy
 *    factual é o que mantém a mensagem em UTILITY (R$ 0,06–0,09) em vez de
 *    MARKETING (R$ 0,40–0,55) quando ela sai pelo WhatsApp oficial.
 *
 * O envio em si é exercitado pelo teste do núcleo do cron; aqui estão as regras
 * que um mock de Supabase não conseguiria provar sem virar um simulador inteiro.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mesmoDiaUTC, pilulaPendente } from '@/lib/notifications/carimbo-canal';
import { emailEvidencia } from '@/lib/notifications/pilula-envio';
import { pushEvidencia, LIMITE_TITULO, LIMITE_CORPO } from '@/lib/notifications/push-copy';
import { TEMPLATES } from '@/lib/whatsapp/templates';

const HOJE = '2026-08-20';
const ONTEM_TS = '2026-08-19T11:00:00.000Z';
const HOJE_TS = '2026-08-20T11:00:00.000Z';

describe('gate por canal — a recuperação que a quinta não tinha', () => {
  it('e-mail entregue e WhatsApp falho: a evidência SEGUE pendente', () => {
    // Este é o caso de 13/08: o WhatsApp caiu no meio. Com gate por canal, a
    // próxima passada recupera; com o gate antigo (`ultima_evidencia_em`), não.
    expect(
      pilulaPendente({
        temTelefone: true, temEmail: true, temPush: false,
        carimboWhatsapp: null, carimboEmail: HOJE_TS, carimboPush: null,
        hojeUTC: HOJE,
      }),
    ).toBe(true);
  });

  it('todos os canais aplicáveis carimbados hoje: não pende', () => {
    expect(
      pilulaPendente({
        temTelefone: true, temEmail: true, temPush: true,
        carimboWhatsapp: HOJE_TS, carimboEmail: HOJE_TS, carimboPush: HOJE_TS,
        hojeUTC: HOJE,
      }),
    ).toBe(false);
  });

  it('canal inaplicável nunca pende — quem não tem telefone não trava a quinta', () => {
    expect(
      pilulaPendente({
        temTelefone: false, temEmail: true, temPush: false,
        carimboWhatsapp: null, carimboEmail: HOJE_TS, carimboPush: null,
        hojeUTC: HOJE,
      }),
    ).toBe(false);
  });

  it('carimbo de ONTEM não conta como hoje', () => {
    expect(
      pilulaPendente({
        temTelefone: true, temEmail: true, temPush: false,
        carimboWhatsapp: ONTEM_TS, carimboEmail: ONTEM_TS, carimboPush: null,
        hojeUTC: HOJE,
      }),
    ).toBe(true);
  });
});

describe('avanço de semana — no máximo UMA vez por dia', () => {
  /**
   * Réplica da decisão que o cron toma. Mantida aqui como função pura porque a
   * regra é de CALENDÁRIO, não de entrega: ela não pode mudar junto com o
   * refactor de canal, e um teste que precisasse do Supabase inteiro para
   * exercitá-la não seria escrito.
   */
  const deveAvancar = (ultimaEvidenciaEm: string | null, hojeUTC: string) =>
    !mesmoDiaUTC(ultimaEvidenciaEm, hojeUTC);

  it('primeira passada do dia avança', () => {
    expect(deveAvancar(null, HOJE)).toBe(true);
    expect(deveAvancar(ONTEM_TS, HOJE)).toBe(true);
  });

  it('🔴 segunda passada no MESMO dia NÃO avança — senão pula uma semana', () => {
    // Cenário real: e-mail saiu às 11h (carimbou ultima_evidencia_em), o WhatsApp
    // falhou, o QStash retenta às 11h05. O gate por canal deixa entrar de novo —
    // e é isto aqui que impede o segundo `semana_atual + 1`.
    expect(deveAvancar(HOJE_TS, HOJE)).toBe(false);
  });

  it('a quinta seguinte volta a avançar', () => {
    expect(deveAvancar(HOJE_TS, '2026-08-27')).toBe(true);
  });
});

describe('copy do e-mail alinhada ao template aprovado', () => {
  const { subject, html } = emailEvidencia('Maria Souza', {
    semana: 5,
    baseUrl: 'https://ibipeba.vertho.ai',
  });

  it('usa o primeiro nome, a semana e o deep-link do TENANT', () => {
    expect(html).toContain('Olá, Maria.');
    expect(html).toContain('semana 5');
    expect(html).toContain('https://ibipeba.vertho.ai');
    expect(subject).toContain('Semana 5');
  });

  it('afirma o mesmo fato que o template da Meta, sem urgência nem marca-chamariz', () => {
    // O template aprovado diz "O registro de evidências desta semana está
    // pendente" — o e-mail precisa dizer a mesma coisa.
    expect(TEMPLATES.evidencia_semanal.body).toContain('pendente');
    expect(html).toContain('pendente');
    // Os sinais que reclassificaram templates para MARKETING em 14/08.
    expect(html).not.toMatch(/acesse\s+agora|hoje!|não\s+perca/i);
    expect(html).not.toMatch(/plataforma\s+vertho/i);
  });

  it('não deixa placeholder cru escapar', () => {
    expect(html).not.toContain('{{');
    expect(html).not.toContain('undefined');
    expect(subject).not.toContain('undefined');
  });
});

describe('paridade entre a coluna de carimbo e o webhook que a grava', () => {
  // Quem grava `ultima_evidencia_whatsapp_em` é o webhook `whatsapp-cis`, e lá o
  // `carimboCampo` é um enum FECHADO dentro de um schema `.strict()`. Publicar um
  // campo que não está no enum NÃO degrada o carimbo: o Zod rejeita o payload
  // inteiro e a MENSAGEM NÃO SAI. Este teste existe porque descobri isso lendo o
  // consumidor, não pelo typecheck — o publisher e o webhook falam por JSON.
  const rota = readFileSync('app/api/webhooks/qstash/whatsapp-cis/route.ts', 'utf-8');

  it.each([
    'ultima_pilula1_whatsapp_em',
    'ultima_pilula2_whatsapp_em',
    'ultima_evidencia_whatsapp_em',
  ])('%s está no enum de carimboCampo do webhook', (campo) => {
    const enumBloco = rota.slice(rota.indexOf('carimboCampo: z.enum('));
    expect(enumBloco.slice(0, 300)).toContain(campo);
  });

  it('o motivo da evidência NÃO é gravado como pílula', () => {
    // Era literal 'pilula' para qualquer carimbo: a evidência entraria na
    // contagem de cadência como se fosse conteúdo.
    expect(rota).toContain('ultima_evidencia_whatsapp_em: \'evidencia\'');
    expect(rota).toContain('MOTIVO_POR_CARIMBO[carimboCampo]');
  });

  it('o mapa de motivos é exaustivo por construção (satisfies), não por comentário', () => {
    expect(rota).toContain('satisfies Record<CarimboCampo, string>');
  });
});

describe('copy do push', () => {
  const t = pushEvidencia(5);

  it('cabe nos limites da tela de bloqueio', () => {
    expect(t.titulo.length).toBeLessThanOrEqual(LIMITE_TITULO);
    expect(t.corpo.length).toBeLessThanOrEqual(LIMITE_CORPO);
  });

  it('fala do que FALTA, e não repete a marca (o app já aparece acima)', () => {
    expect(t.corpo).toMatch(/ainda não registrou/i);
    expect(`${t.titulo} ${t.corpo}`).not.toMatch(/vertho/i);
  });

  it('semana entra no título, para a pessoa reconhecer de relance', () => {
    expect(pushEvidencia(12).titulo).toContain('12');
  });
});
