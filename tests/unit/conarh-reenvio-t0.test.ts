import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * CONARH 52 — a varredura da fila do T+0.
 *
 * O que este arquivo protege, em ordem de importância:
 *
 * 1. **Teto não some com gente.** Quem não coube na rodada é REPORTADO como
 *    adiado, não descartado. Teto silencioso lê-se como "cobriu tudo" — e a fila
 *    existe justamente porque ninguém pode sumir dela sem receber.
 * 2. **Cadência.** O lote sai espaçado pela política única. Foi disparo sem
 *    intervalo que derrubou o número em 11/08 (155 mensagens a 2s), e leads de
 *    feira são exatamente o perfil de risco: números que nunca trocaram mensagem
 *    com o remetente.
 * 3. **`desconhecido` fica fora do automático.** Leads anteriores à mig 221 não
 *    têm entrega verificável; reenviar o recorte para quem já leu é ruído.
 */

const leadsNaFila = [
  { id: 'l1', t0_tentativas: 0 },
  { id: 'l2', t0_tentativas: 2 },
  { id: 'l3', t0_tentativas: 0 },
];

const sb = criarSupabaseMock({
  lista: () => leadsNaFila,
  contagem: () => 7,
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

const entregarT0 = vi.fn();
vi.mock('@/lib/conarh/entrega-t0', () => ({ entregarT0: (...a: any[]) => entregarT0(...a) }));

const { reenviarPendentesT0, contarEntregasT0 } = await import('@/lib/conarh/reenvio-t0');

beforeEach(() => {
  sb.reset();
  entregarT0.mockReset();
  entregarT0.mockResolvedValue({ tipo: 'executado', status: 'enviado' });
  process.env.WHATSAPP_LOTE_INTERVALO_MS = '1'; // não dormir 6s por lead no teste
  delete process.env.WHATSAPP_LOTE_MAX;
});

describe('reenviarPendentesT0', () => {
  it('varre só pendente/falhou e reporta o resultado', async () => {
    const r = await reenviarPendentesT0();

    expect(r.elegiveis).toBe(3);
    expect(r.entregues).toBe(3);
    expect(r.restam).toBe(0);
    // 'desconhecido' e 'enviado' não entram: a cadeia pede exatamente os dois.
    expect(sb.usou('diag_leads', 'in', 't0_status')).toBe(true);
    const filtro = sb.chamadas.find((c) => c.metodo === 'in' && c.args[0] === 't0_status');
    expect(filtro!.args[1]).toEqual(['pendente', 'falhou']);
  });

  it('escopa na campanha da feira — nunca vira remetente de qualquer diag_lead', async () => {
    await reenviarPendentesT0();
    expect(sb.usou('diag_leads', 'eq', 'scope_id')).toBe(true);
  });

  it('a CABEÇA da fila primeiro: quem espera há mais tempo recebe antes', async () => {
    await reenviarPendentesT0();
    const ordem = sb.chamadas.find((c) => c.metodo === 'order');
    expect(ordem!.args[0]).toBe('criado_em');
    expect(ordem!.args[1]).toEqual({ ascending: true });
  });

  it('🔑 teto de volume ADIA e REPORTA — não descarta em silêncio', async () => {
    process.env.WHATSAPP_LOTE_MAX = '2';

    const r = await reenviarPendentesT0();

    expect(entregarT0).toHaveBeenCalledTimes(2);
    expect(r.entregues).toBe(2);
    expect(r.adiados).toBe(1);
    expect(r.motivoDoTeto).toBe('volume');
    // O que sobrou continua na fila: adiar ≠ pular.
    expect(r.restam).toBe(1);
  });

  it('a varredura automática não força reenvio de quem já recebeu', async () => {
    await reenviarPendentesT0();
    for (const chamada of entregarT0.mock.calls) {
      expect(chamada[1]?.forcar).toBeFalsy();
    }
  });

  it('automático ignora quem já esgotou tentativas; o manual pode insistir', async () => {
    await reenviarPendentesT0();
    expect(sb.usou('diag_leads', 'lt', 't0_tentativas')).toBe(true);

    sb.reset();
    await reenviarPendentesT0({ incluirEsgotados: true });
    expect(sb.usou('diag_leads', 'lt', 't0_tentativas')).toBe(false);
  });

  it('um lead que explode não derruba a varredura', async () => {
    entregarT0
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ tipo: 'executado', status: 'enviado' });

    const r = await reenviarPendentesT0();

    expect(r.falharam).toBe(1);
    expect(r.entregues).toBe(2);
  });

  it('leitura falhando LANÇA — o cron precisa devolver 500, não "0 pendentes"', async () => {
    sb.falharEm({ tabela: 'diag_leads', op: 'select', mensagem: 'timeout no pool' });
    await expect(reenviarPendentesT0()).rejects.toThrow(/timeout no pool/);
  });
});

describe('contarEntregasT0', () => {
  it('conta por status com count exact — nunca por .limit()', async () => {
    const c = await contarEntregasT0();

    // O mock devolve 7 para toda contagem: o que se prova aqui é a FORMA da
    // pergunta (contagem exata por status), não o número.
    expect(c.naFila).toBe(c.pendente + c.falhou);
    const select = sb.chamadas.find((ch) => ch.metodo === 'select');
    expect(select!.args[1]).toMatchObject({ count: 'exact', head: true });
  });

  it('contagem falhando LANÇA em vez de devolver zero', async () => {
    sb.falharEm({ tabela: 'diag_leads', op: 'select', mensagem: 'conexão caiu' });
    await expect(contarEntregasT0()).rejects.toThrow(/conexão caiu/);
  });
});
