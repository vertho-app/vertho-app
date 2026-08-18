import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../helpers/mock-request';

/**
 * CONARH 52 — o DISPARO MANUAL da fila do T+0 (`POST /api/conarh/reenviar-t0`).
 *
 * O que este arquivo protege: **quem decide insistir é o servidor, não o corpo
 * do pedido**. O teto de `MAX_TENTATIVAS_AUTOMATICAS` existe para o cron não
 * martelar sozinho para sempre; esta rota é o caminho humano, e herdar aquele
 * teto por omissão tornava a tela incapaz de resgatar o lead que mais precisa.
 *
 * 🔴 O caso real (18/08/2026, dia 1 da feira): um lead capturado às 15:19 gastou
 * as 10 tentativas contra a Z-API caída e, quando o template aprovou às 19:21, já
 * estava fora do cron E do botão — a tela dizia "1 recorte não chegou" e oferecia
 * um botão que, para ele, não fazia nada. A cota foi queimada por avaria do
 * CANAL, não por recusa do destinatário: por isso o default do manual mudou.
 */

const reenviarPendentesT0 = vi.fn();
const contarEntregasT0 = vi.fn();
const entregarT0 = vi.fn();

vi.mock('@/lib/conarh/reenvio-t0', () => ({
  reenviarPendentesT0: (...a: any[]) => reenviarPendentesT0(...a),
  contarEntregasT0: (...a: any[]) => contarEntregasT0(...a),
}));
vi.mock('@/lib/conarh/entrega-t0', () => ({
  entregarT0: (...a: any[]) => entregarT0(...a),
}));

const CHAVE = 'chave-de-teste-do-painel';
const URL_ROTA = 'http://localhost:3000/api/conarh/reenviar-t0';

async function postar(body: any, headers: Record<string, string> = { 'x-conarh-key': CHAVE }) {
  const { POST } = await import('@/app/api/conarh/reenviar-t0/route');
  return POST(mockPOST(URL_ROTA, body, headers));
}

beforeEach(() => {
  vi.resetModules();
  reenviarPendentesT0.mockReset();
  contarEntregasT0.mockReset();
  entregarT0.mockReset();
  reenviarPendentesT0.mockResolvedValue({
    elegiveis: 1, entregues: 1, falharam: 0, adiados: 0, motivoDoTeto: null, restam: 0,
  });
  contarEntregasT0.mockResolvedValue({
    enviado: 1, pendente: 0, falhou: 0, desconhecido: 0, naFila: 0,
  });
  process.env.CONARH_PANEL_KEY = CHAVE;
});

describe('POST /api/conarh/reenviar-t0 — a varredura manual', () => {
  it('🔑 corpo VAZIO já insiste nos esgotados: o botão da tela alcança quem o cron abandonou', async () => {
    const res = await postar({});

    expect(res.status).toBe(200);
    expect(reenviarPendentesT0).toHaveBeenCalledWith({ incluirEsgotados: true });
  });

  it('a saída conservadora continua existindo, mas precisa ser PEDIDA', async () => {
    await postar({ incluirEsgotados: false });

    expect(reenviarPendentesT0).toHaveBeenCalledWith({ incluirEsgotados: false });
  });

  it('valor lixo no corpo não desliga o resgate — só o `false` explícito desliga', async () => {
    await postar({ incluirEsgotados: 'nao' });

    expect(reenviarPendentesT0).toHaveBeenCalledWith({ incluirEsgotados: true });
  });

  it('lead único não passa pela varredura: vai direto em entregarT0, sem teto', async () => {
    entregarT0.mockResolvedValue({ tipo: 'executado', status: 'enviado', canal: 'whatsapp' });

    await postar({ leadId: 'lead-1' });

    expect(entregarT0).toHaveBeenCalledWith('lead-1', { forcar: false });
    expect(reenviarPendentesT0).not.toHaveBeenCalled();
  });

  it('sem a chave no header: 401 e NENHUM envio — a rota que escreve é fechada', async () => {
    const res = await postar({}, {});

    expect(res.status).toBe(401);
    expect(reenviarPendentesT0).not.toHaveBeenCalled();
  });
});
