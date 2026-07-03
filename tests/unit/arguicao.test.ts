import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAIChat: vi.fn(), callAI: vi.fn() }));

import {
  buildArguicaoSystemPrompt,
  abrirArguicao,
  turnoArguicao,
  extrairEvidenciasArguicao,
  type ArguicaoContexto,
  type ArguicaoEstado,
} from '@/lib/season-engine/arguicao';
import { callAIChat, callAI } from '@/actions/ai-client';

const mockChat = vi.mocked(callAIChat);
const mockAI = vi.mocked(callAI);

const CTX: ArguicaoContexto = {
  nomeColab: 'Rodrigo',
  cargo: 'Representante Comercial',
  competencia: 'Comunicação de Valor',
  perfilDominante: 'Alto D',
  cenario: '## Cliente silencioso\nA Caltex sumiu...',
  respostaCenario: '[SITUAÇÃO] ...\n→ Eu ligaria pra Caltex.',
  descritores: [{ descritor: 'Traduz técnica em benefício' }, { descritor: 'Atualização sobre oferta' }],
  isPiloto: false,
};

const reply = (visivel: string, meta: object = {}) =>
  `${visivel}\n[META]${JSON.stringify({ turno: 1, sondagem_atual: 'aprofundar_criterio', evidencias_coletadas: [], encerrar: false, ...meta })}[/META]`;

beforeEach(() => { mockChat.mockReset(); mockAI.mockReset(); });

describe('arguição — motor', () => {
  it('abrirArguicao: 1ª pergunta parte da resposta ao cenário; estado turno 1', async () => {
    mockChat.mockResolvedValueOnce(reply('Você disse que ligaria. Que critério define a hora?'));
    const { estado, reply: r } = await abrirArguicao(CTX, 4);
    expect(estado.turno).toBe(1);
    expect(estado.concluida).toBe(false);
    expect(r).not.toContain('[META]'); // fala visível limpa
    // a semente (cenário+resposta) foi ao histórico de chat da IA
    const seed = mockChat.mock.calls[0][1] as any[];
    expect(seed[0].content).toContain('RESPOSTA QUE RODRIGO DEU');
  });

  it('turnoArguicao: avança turno e devolve reply sem META', async () => {
    const estado: ArguicaoEstado = { historico: [{ role: 'assistant', content: 'q1', turn: 1 }], turno: 1, concluida: false };
    mockChat.mockResolvedValueOnce(reply('E se o cliente já tivesse recusado antes?'));
    const r = await turnoArguicao(CTX, estado, 'Eu ligaria assim mesmo', 4);
    expect(r.estado.turno).toBe(2);
    expect(r.concluida).toBe(false);
    expect(r.reply).toBe('E se o cliente já tivesse recusado antes?');
    // registrou a resposta do colab + a nova sondagem
    expect(r.estado.historico.filter(h => h.role === 'user').map(h => h.content)).toContain('Eu ligaria assim mesmo');
  });

  it('encerra ao atingir maxTurnos (teto da config)', async () => {
    const estado: ArguicaoEstado = { historico: [], turno: 3, concluida: false };
    mockChat.mockResolvedValueOnce(reply('última'));
    const r = await turnoArguicao(CTX, estado, 'ok', 4); // 3→4 = maxTurnos
    expect(r.concluida).toBe(true);
  });

  it('encerra por meta.encerrar=true antes do teto', async () => {
    const estado: ArguicaoEstado = { historico: [], turno: 1, concluida: false };
    mockChat.mockResolvedValueOnce(reply('fechando', { encerrar: true }));
    const r = await turnoArguicao(CTX, estado, 'resposta', 8);
    expect(r.concluida).toBe(true);
  });

  it('encerra por evidências suficientes + sondagem=encerramento', async () => {
    const estado: ArguicaoEstado = { historico: [], turno: 2, concluida: false };
    mockChat.mockResolvedValueOnce(reply('ok', {
      sondagem_atual: 'encerramento',
      risco_de_encerramento_prematuro: false,
      evidencias_coletadas: [{ forca: 'forte' }, { forca: 'moderada' }],
    }));
    const r = await turnoArguicao(CTX, estado, 'x', 8);
    expect(r.concluida).toBe(true);
  });

  it('NÃO encerra cedo se risco de encerramento prematuro', async () => {
    const estado: ArguicaoEstado = { historico: [], turno: 2, concluida: false };
    mockChat.mockResolvedValueOnce(reply('ok', {
      sondagem_atual: 'encerramento',
      risco_de_encerramento_prematuro: true,
      evidencias_coletadas: [{ forca: 'forte' }, { forca: 'forte' }],
    }));
    const r = await turnoArguicao(CTX, estado, 'x', 8);
    expect(r.concluida).toBe(false);
  });

  it('estado já concluído → no-op (não chama IA)', async () => {
    const estado: ArguicaoEstado = { historico: [], turno: 4, concluida: true };
    const r = await turnoArguicao(CTX, estado, 'x', 4);
    expect(r.concluida).toBe(true);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('prompt do PILOTO herda a proibição de falar em evolução', () => {
    const sysPiloto = buildArguicaoSystemPrompt({ ...CTX, isPiloto: true }, 4, 1);
    const sysRegular = buildArguicaoSystemPrompt(CTX, 8, 1);
    expect(sysPiloto).toContain('PROIBIDO falar em "evolução"');
    expect(sysPiloto).toContain('DEGUSTAÇÃO');
    expect(sysRegular).not.toContain('DEGUSTAÇÃO');
  });

  it('prompt sempre ancora na resposta do cenário e nos nomes dos descritores', () => {
    const sys = buildArguicaoSystemPrompt(CTX, 6, 2);
    expect(sys).toContain('Parta SEMPRE da resposta');
    expect(sys).toContain('Traduz técnica em benefício');
    expect(sys).not.toContain('D1'); // nunca cita código
  });

  it('extrairEvidenciasArguicao: parseia extração e ignora o bloco do cenário', async () => {
    const estado: ArguicaoEstado = {
      historico: [
        { role: 'user', content: '═══ CENÁRIO APRESENTADO ═══\n...' }, // semente, ignorada
        { role: 'assistant', content: 'pergunta [META]{}[/META]' },
        { role: 'user', content: 'minha defesa' },
      ],
      turno: 1, concluida: true,
    };
    mockAI.mockResolvedValueOnce(JSON.stringify({
      resumo: { leitura_geral: 'ok', sustentacao_mais_forte: 'x', fragilidade_mais_relevante: 'y' },
      evidencias_por_descritor: [{ descritor: 'Traduz técnica em benefício', sustentou: 'confirmou', citacao: 'z', forca: 'moderada' }],
    }));
    const ext = await extrairEvidenciasArguicao(CTX, estado);
    expect(ext?.evidencias_por_descritor[0].sustentou).toBe('confirmou');
    const userPrompt = String(mockAI.mock.calls[0][1]);
    expect(userPrompt).not.toContain('CENÁRIO APRESENTADO'); // semente filtrada
    expect(userPrompt).toContain('minha defesa');
  });

  it('extração com JSON inválido → null (nunca quebra o fechamento)', async () => {
    mockAI.mockResolvedValueOnce('não é json');
    const ext = await extrairEvidenciasArguicao(CTX, { historico: [], turno: 1, concluida: true });
    expect(ext).toBeNull();
  });
});
