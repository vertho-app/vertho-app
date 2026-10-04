import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-94 (04/10/2026): o cron diário recupera o que falhou e não larga o atrasado.
 *
 * O cron só agia no dia exato de cada papel: template recusado, SES caído ou cron perdido
 * nunca eram refeitos (no dia seguinte ele olhava OUTRO papel), e quem ficava atrasado
 * recebia "concluído" na quinta em que o relógio passava do fim do plano. Aqui o cron roda
 * de verdade, com os canais em stub. Datas de novembro de 2026: 9/11 é segunda.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  templates: {} as Record<string, string | null>,
  envioTemplate: vi.fn(),
  envioPilula: vi.fn(),
  email: vi.fn(),
  push: vi.fn(),
  fila: vi.fn(),
  degradacao: vi.fn(),
}));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ ...h.sb.client, raw: h.sb.client }) }));
vi.mock('@/lib/degradacao', () => ({ registrarDegradacao: h.degradacao, DEGRADACAO: new Proxy({}, { get: (_t, p) => String(p) }) }));
vi.mock('@/lib/whatsapp', () => ({ assertFilaDoProvedorLimpa: vi.fn(async () => {}) }));
vi.mock('@/lib/qstash-publish', () => ({ publicarWhatsappCis: h.fila }));
vi.mock('@/lib/notifications/push-core', () => ({ enviarPush: h.push }));
vi.mock('@/lib/season-engine/formato-anunciado', () => ({
  formatosEntregaveis: async () => ['texto'],
  escolherFormatoAnunciado: () => 'texto',
  formatoDeReserva: () => 'texto',
}));
vi.mock('@/lib/notifications/pilula-template', () => ({
  templateAtivo: (papel: string) => h.templates[papel] ?? null,
  enviarPorTemplate: h.envioTemplate,
  enviarPilulaPorTemplate: h.envioPilula,
}));
vi.mock('@/lib/notifications/pilula-envio', async (orig) => ({
  ...(await orig<any>()),
  enviarEmailPilula: h.email,
}));

import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';

const EMPRESA = { id: 'emp-1', slug: 'escola', is_demo: false, sys_config: {} };
const dia = (hojeUTC: string, hoje: number, hora = '11:00:00Z') => ({ hoje, hojeUTC, agora: `${hojeUTC}T${hora}` });
const SEG = dia('2026-11-09', 1);
const TER = dia('2026-11-10', 2);
const QUA = dia('2026-11-11', 3);
const QUI = dia('2026-11-12', 4);
const SEX = dia('2026-11-13', 5);
const SAB = dia('2026-11-14', 6);

const conteudo = (semana: number) => ({
  semana, tipo: 'conteudo', descritor: `D${semana}`,
  conteudos_dia: [{ descritor: `D${semana}`, conteudo: { titulo: `Tema ${semana}` } }, { descritor: `D${semana}b`, conteudo: { titulo: `Tema ${semana}b` } }],
});
const PLANO = [1, 2, 3, 4, 5, 6].map(conteudo).concat([{ semana: 7, tipo: 'avaliacao' } as any]);

interface Cenario {
  semanaAtual?: number;
  dataInicio?: string;
  stamps?: Record<string, string | null>;
  concluidas?: number[];
  statusTrilha?: string;
  semProgresso?: boolean;
  email?: string | null;
  whatsapp?: string | null;
}

function cron(c: Cenario = {}) {
  h.sb = criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'fase4_envios') {
        return [{
          id: 'env-1', colaborador_id: 'c1', semana_atual: c.semanaAtual ?? 1, status: 'ativo',
          ultima_pilula1_em: null, ultima_pilula2_em: null, ultima_evidencia_em: null,
          ultima_pilula1_whatsapp_em: null, ultima_pilula1_email_em: null, ultima_pilula1_push_em: null,
          ultima_pilula2_whatsapp_em: null, ultima_pilula2_email_em: null, ultima_pilula2_push_em: null,
          ultima_evidencia_whatsapp_em: null, ultima_evidencia_email_em: null, ultima_evidencia_push_em: null,
          ...(c.stamps || {}),
          colaboradores: {
            nome_completo: 'Maria Souza',
            whatsapp: c.whatsapp === undefined ? '+5571999990000' : c.whatsapp,
            email: c.email === undefined ? 'maria@x.br' : c.email,
            perfil_dominante: 'S', cargo: 'Professora',
          },
        }];
      }
      if (tabela === 'trilhas') {
        return [{ id: 't1', colaborador_id: 'c1', numero_temporada: 1, temporada_plano: PLANO, competencia_foco: 'Planejamento', data_inicio: c.dataInicio ?? '2026-11-09', status: c.statusTrilha ?? 'ativa' }];
      }
      if (tabela === 'temporada_semana_progresso') {
        return (c.concluidas || []).map((s) => ({ trilha_id: 't1', colaborador_id: 'c1', semana: s, status: 'concluido' }));
      }
      return [];
    },
  });
}

const atualizacoes = () => h.sb.escritas.filter((e: any) => e.tabela === 'fase4_envios' && e.op === 'update').map((e: any) => e.payload);
const pilulaDe = (n: number) => h.envioPilula.mock.calls.map((c: any[]) => c[0]).filter((a: any) => a.pilula === n);

describe('cron diário: recuperação e pós-fim', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    h.templates = {};
    for (const f of [h.envioTemplate, h.envioPilula, h.email, h.push, h.fila, h.degradacao]) f.mockReset();
    h.envioTemplate.mockResolvedValue({ tentou: true, ok: true });
    h.envioPilula.mockResolvedValue({ tentou: true, ok: true });
    h.email.mockResolvedValue({ ok: true });
    h.push.mockResolvedValue({ entregues: 0, falhas: 0 });
  });
  afterEach(() => { vi.useRealTimers(); });

  describe('recuperação de 1 a 2 dias', () => {
    // Segunda: o e-mail da P1 saiu e o WhatsApp falhou (sem carimbo). A P2 de terça saiu inteira.
    const aposSegundaComWhatsappFalho = {
      ultima_pilula1_em: '2026-11-09T11:05:00Z', ultima_pilula1_email_em: '2026-11-09T11:05:00Z',
      ultima_pilula2_em: '2026-11-10T11:05:00Z', ultima_pilula2_email_em: '2026-11-10T11:05:00Z', ultima_pilula2_whatsapp_em: '2026-11-10T11:05:00Z',
    };

    it('🔴 quarta: o WhatsApp da P1 de segunda que falhou é REFEITO, e o e-mail que já saiu NÃO se repete', async () => {
      vi.setSystemTime(new Date(QUA.agora));
      cron({ stamps: aposSegundaComWhatsappFalho });
      const r = await processarEmpresaDiario(EMPRESA, QUA);
      expect(pilulaDe(1)).toHaveLength(1);
      expect(h.email).not.toHaveBeenCalled();
      expect(r.recuperacoes).toBe(1);
      const carimbos = atualizacoes().find((p: any) => p.ultima_pilula1_whatsapp_em);
      expect(carimbos).toBeTruthy();
      // Nada de texto livre na recuperação: ele está morto desde 13/08/2026.
      expect(h.fila).not.toHaveBeenCalled();
    });

    it('🔴 a recuperação que deu certo vira "já saiu" e não se repete (idempotência)', async () => {
      vi.setSystemTime(new Date(QUA.agora));
      cron({ stamps: { ...aposSegundaComWhatsappFalho, ultima_pilula1_whatsapp_em: '2026-11-11T11:00:30Z' } });
      const r = await processarEmpresaDiario(EMPRESA, QUA);
      expect(h.envioPilula).not.toHaveBeenCalled();
      expect(r.recuperacoes).toBe(0);
    });

    it('🔴 terça (dia com papel agendado): a P2 sai e a P1 que falhou NÃO é refeita no mesmo dia', async () => {
      vi.setSystemTime(new Date(TER.agora));
      cron({ stamps: { ultima_pilula1_em: '2026-11-09T11:05:00Z', ultima_pilula1_email_em: '2026-11-09T11:05:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, TER);
      expect(pilulaDe(2)).toHaveLength(1);
      expect(pilulaDe(1)).toHaveLength(0);
      expect(r.recuperacoes).toBe(0);
    });

    it('🔴 template recusado (tentou: false) na recuperação NÃO cai no texto livre da fila', async () => {
      vi.setSystemTime(new Date(QUA.agora));
      h.envioPilula.mockResolvedValue({ tentou: false });
      cron({ stamps: aposSegundaComWhatsappFalho });
      await processarEmpresaDiario(EMPRESA, QUA);
      expect(h.fila).not.toHaveBeenCalled();
    });

    it('na segunda (dia agendado) o caminho legado segue como sempre: a fila é usada quando não há template', async () => {
      vi.setSystemTime(new Date(SEG.agora));
      h.envioPilula.mockResolvedValue({ tentou: false });
      cron({});
      await processarEmpresaDiario(EMPRESA, SEG);
      expect(h.fila).toHaveBeenCalledTimes(1);
    });

    it('🔴 a janela é de 2 dias: no domingo, nada', async () => {
      vi.setSystemTime(new Date('2026-11-15T11:00:00Z'));
      cron({ stamps: aposSegundaComWhatsappFalho });
      const r = await processarEmpresaDiario(EMPRESA, dia('2026-11-15', 0));
      expect(r.pilulas + r.emails + r.evidencias).toBe(0);
      expect(h.envioPilula).not.toHaveBeenCalled();
    });

    it('quem concluiu tudo ou não tem contato aplicável não é "recuperado" à toa', async () => {
      vi.setSystemTime(new Date(QUA.agora));
      cron({ stamps: aposSegundaComWhatsappFalho, whatsapp: null });
      const r = await processarEmpresaDiario(EMPRESA, QUA);
      // Sem telefone, o único canal (e-mail) já saiu na segunda: não pende.
      expect(r.recuperacoes).toBe(0);
      expect(h.email).not.toHaveBeenCalled();
    });
  });

  describe('evidência de quinta, recuperada na sexta e no sábado', () => {
    it('🔴 sexta: o desafio que não chegou por WhatsApp é refeito, e o relógio NÃO avança de novo', async () => {
      vi.setSystemTime(new Date(SEX.agora));
      // A quinta rodou: e-mail saiu, WhatsApp falhou, o relógio já andou (carimbo da evidência de quinta).
      cron({ semanaAtual: 2, stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z', ultima_evidencia_email_em: '2026-11-12T11:05:00Z', ultima_pilula1_em: '2026-11-09T11:00:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, SEX);
      expect(h.envioTemplate).toHaveBeenCalledTimes(1);
      expect(h.envioTemplate.mock.calls[0][0]).toBe('desafio');
      expect(r.recuperacoes).toBe(1);
      expect(atualizacoes().some((p: any) => 'semana_atual' in p)).toBe(false);
      expect(h.email).not.toHaveBeenCalled();
    });

    it('🔴 CRON PERDIDO na quinta: a sexta refaz a cobrança E avança o relógio (uma vez)', async () => {
      vi.setSystemTime(new Date(SEX.agora));
      cron({ semanaAtual: 1, stamps: { ultima_pilula1_em: '2026-11-09T11:00:00Z' } });
      await processarEmpresaDiario(EMPRESA, SEX);
      const avancos = atualizacoes().filter((p: any) => 'semana_atual' in p);
      expect(avancos).toHaveLength(1);
      expect(avancos[0].semana_atual).toBe(2);
    });

    it('o inativo há mais de 14 dias que recebeu o nudge de inatividade na quinta NÃO recebe a cobrança do desafio na sexta', async () => {
      vi.setSystemTime(new Date(SEX.agora));
      cron({ stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z', ultima_pilula1_em: '2026-10-19T11:00:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, SEX);
      expect(h.envioTemplate).not.toHaveBeenCalled();
      expect(h.email).not.toHaveBeenCalled();
      expect(r.nudges).toBe(0);
    });

    it('sábado ainda é janela (atraso 2); o domingo não', async () => {
      vi.setSystemTime(new Date(SAB.agora));
      cron({ semanaAtual: 2, stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z', ultima_evidencia_email_em: '2026-11-12T11:05:00Z', ultima_pilula1_em: '2026-11-09T11:00:00Z' } });
      expect((await processarEmpresaDiario(EMPRESA, SAB)).recuperacoes).toBe(1);
    });
  });

  describe('fim do calendário: o atrasado não fica em silêncio', () => {
    // Plano de 7 semanas começou em 28/9: em 26/11 a trilha está na semana 9 PELA DATA (2 além do fim).
    const POS_FIM = { semanaAtual: 8, dataInicio: '2026-09-28', concluidas: [1, 2, 3] };
    const QUINTA_POS = dia('2026-11-26', 4);
    const segunda_pos = dia('2026-11-23', 1);

    it('🔴 a pendência sai na quinta (14 dias do último aviso), o envio NÃO é concluído e o relógio não anda', async () => {
      vi.setSystemTime(new Date(QUINTA_POS.agora));
      cron({ ...POS_FIM, stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, QUINTA_POS);
      expect(r.pendenciasPosFim).toBe(1);
      expect(h.envioTemplate).toHaveBeenCalledTimes(1);
      const [papel, args] = h.envioTemplate.mock.calls[0];
      expect(papel).toBe('pendencia');
      // A mensagem diz o teto do plano, não "semana 9" numa jornada de 7.
      expect(args.semana).toBe(7);
      expect(h.email).toHaveBeenCalledTimes(1);
      expect(atualizacoes().some((p: any) => p.status === 'concluido')).toBe(false);
      expect(atualizacoes().some((p: any) => 'semana_atual' in p)).toBe(false);
      // O carimbo do aviso renova o prazo de 14 dias.
      expect(atualizacoes().some((p: any) => p.ultima_evidencia_em && p.ultima_evidencia_em.startsWith('2026-11-26'))).toBe(true);
    });

    it('🔴 entre as quinzenas espera, sem concluir e sem mandar nada', async () => {
      vi.setSystemTime(new Date(QUINTA_POS.agora));
      cron({ ...POS_FIM, stamps: { ultima_evidencia_em: '2026-11-19T11:05:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, QUINTA_POS);
      expect(r.pendenciasPosFim).toBe(0);
      expect(h.envioTemplate).not.toHaveBeenCalled();
      expect(atualizacoes()).toHaveLength(0);
    });

    it('fora da quinta, passado o fim, nada acontece (como antes)', async () => {
      vi.setSystemTime(new Date(segunda_pos.agora));
      cron({ ...POS_FIM, stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, segunda_pos);
      expect(r.pendenciasPosFim).toBe(0);
      expect(h.envioTemplate).not.toHaveBeenCalled();
      expect(h.email).not.toHaveBeenCalled();
    });

    it('quem concluiu as 7 semanas é concluído, sem pendência', async () => {
      vi.setSystemTime(new Date(QUINTA_POS.agora));
      cron({ ...POS_FIM, concluidas: [1, 2, 3, 4, 5, 6, 7], stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, QUINTA_POS);
      expect(r.pendenciasPosFim).toBe(0);
      expect(atualizacoes().some((p: any) => p.status === 'concluido')).toBe(true);
      expect(h.envioTemplate).not.toHaveBeenCalled();
    });

    it('trilha pausada ou sem leitura do progresso: concluído, como antes (não se cobra quem pausou nem por dado não lido)', async () => {
      vi.setSystemTime(new Date(QUINTA_POS.agora));
      cron({ ...POS_FIM, statusTrilha: 'pausada', stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z' } });
      await processarEmpresaDiario(EMPRESA, QUINTA_POS);
      expect(atualizacoes().some((p: any) => p.status === 'concluido')).toBe(true);
      expect(h.envioTemplate).not.toHaveBeenCalled();

      for (const f of [h.envioTemplate, h.email]) f.mockClear();
      cron({ ...POS_FIM, concluidas: [], stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z' } });
      h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' });
      await processarEmpresaDiario(EMPRESA, QUINTA_POS);
      expect(atualizacoes().some((p: any) => p.status === 'concluido')).toBe(true);
      expect(h.envioTemplate).not.toHaveBeenCalled();
    });

    it('8 semanas depois do fim a pendência acaba: o envio é concluído', async () => {
      const tarde = dia('2027-01-14', 4);
      vi.setSystemTime(new Date(tarde.agora));
      cron({ ...POS_FIM, stamps: { ultima_evidencia_em: '2026-12-31T11:05:00Z' } });
      const r = await processarEmpresaDiario(EMPRESA, tarde);
      expect(r.pendenciasPosFim).toBe(0);
      expect(atualizacoes().some((p: any) => p.status === 'concluido')).toBe(true);
    });

    it('a conclusão que não gravou é registrada (antes era um update sem checar o erro)', async () => {
      vi.setSystemTime(new Date(QUINTA_POS.agora));
      cron({ ...POS_FIM, concluidas: [1, 2, 3, 4, 5, 6, 7], stamps: { ultima_evidencia_em: '2026-11-12T11:05:00Z' } });
      h.sb.falharEm({ tabela: 'fase4_envios', op: 'update', mensagem: 'timeout no pool' });
      const r = await processarEmpresaDiario(EMPRESA, QUINTA_POS);
      expect(r.erros).toBe(1);
      expect(h.degradacao.mock.calls.map((c: any[]) => c[0]).some((x: any) => x.chave === 'conclusao-envio:emp-1')).toBe(true);
    });
  });
});
