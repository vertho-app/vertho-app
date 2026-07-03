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

  it('payload à IA só tem {role, content} — sem `turn` (a API rejeita campos extras)', async () => {
    const estado: ArguicaoEstado = {
      historico: [
        { role: 'user', content: '═══ CENÁRIO ═══' },
        { role: 'assistant', content: 'q1', turn: 1 },
      ],
      turno: 1, concluida: false,
    };
    mockChat.mockResolvedValueOnce(reply('próxima?'));
    await turnoArguicao(CTX, estado, 'minha defesa', 4);
    const payload = mockChat.mock.calls[0][1] as any[];
    for (const m of payload) {
      expect(Object.keys(m).sort()).toEqual(['content', 'role']);
    }
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

describe('arguição — PII masking (Fase C)', () => {
  // Espelha a ORDEM do maskColaborador: alias→primeiroNome ANTES de
  // nomeCompleto→alias (senão as duas entradas se cancelam no maskTextPII).
  const PII = { map: { 'COLAB_1A2B': 'Rodrigo', 'Rodrigo Naves': 'COLAB_1A2B' }, nomeMasked: 'COLAB_1A2B' };
  const CTX_PII: ArguicaoContexto = {
    ...CTX,
    nomeColab: 'Rodrigo',
    respostaCenario: '[SITUAÇÃO] ...\n→ Sou Rodrigo Naves e meu email é rodrigo@acme.com, tel (11) 99999-8888.',
  };

  it('mascara nome/email/telefone no payload da IA e desmascara o reply', async () => {
    mockChat.mockResolvedValueOnce(reply('COLAB_1A2B, que critério você usou?'));
    const { estado, reply: r } = await abrirArguicao(CTX_PII, 4, {}, PII);
    // Payload enviado à IA: mascarado
    const seed = mockChat.mock.calls[0][1] as any[];
    expect(seed[0].content).toContain('COLAB_1A2B');
    expect(seed[0].content).not.toContain('Rodrigo Naves');
    expect(seed[0].content).toContain('[email]');
    expect(seed[0].content).toContain('[telefone]');
    // Reply visível: despersonalizado (alias → nome real)
    expect(r).toContain('Rodrigo,');
    expect(r).not.toContain('COLAB_1A2B');
    // Histórico persistido guarda a semente CRUA (colab reabre e vê o próprio texto)
    expect(estado.historico[0].content).toContain('Rodrigo Naves');
  });

  it('turnoArguicao mascara em-voo mas persiste a resposta do colab CRUA', async () => {
    const estado: ArguicaoEstado = { historico: [{ role: 'assistant', content: 'q1', turn: 1 }], turno: 1, concluida: false };
    mockChat.mockResolvedValueOnce(reply('Entendi. E se mudasse?'));
    const r = await turnoArguicao(CTX_PII, estado, 'Meu email é rodrigo@acme.com', 4, {}, PII);
    const payload = mockChat.mock.calls[0][1] as any[];
    expect(JSON.stringify(payload)).toContain('[email]');
    expect(JSON.stringify(payload)).not.toContain('rodrigo@acme.com');
    // persistido cru
    expect(r.estado.historico.some(h => h.content === 'Meu email é rodrigo@acme.com')).toBe(true);
  });

  it('extração mascara a conversa e desmascara as citações no retorno', async () => {
    const estado: ArguicaoEstado = {
      historico: [
        { role: 'assistant', content: 'pergunta' },
        { role: 'user', content: 'Eu, Rodrigo Naves, escolhi ligar.' },
      ],
      turno: 1, concluida: true,
    };
    mockAI.mockResolvedValueOnce(JSON.stringify({
      resumo: { leitura_geral: 'COLAB_1A2B sustentou', sustentacao_mais_forte: 'x', fragilidade_mais_relevante: 'y' },
      evidencias_por_descritor: [{ descritor: 'Traduz técnica em benefício', sustentou: 'aprofundou', citacao: 'COLAB_1A2B disse Z', forca: 'forte' }],
    }));
    const ext = await extrairEvidenciasArguicao(CTX_PII, estado, {}, PII);
    // Conversa enviada à IA: mascarada
    const userPrompt = String(mockAI.mock.calls[0][1]);
    expect(userPrompt).toContain('COLAB_1A2B');
    expect(userPrompt).not.toContain('Rodrigo Naves');
    // Retorno: citações/resumo despersonalizados
    expect(ext?.resumo.leitura_geral).toContain('Rodrigo');
    expect(ext?.evidencias_por_descritor[0].citacao).toContain('Rodrigo');
    expect(ext?.evidencias_por_descritor[0].citacao).not.toContain('COLAB_1A2B');
  });

  it('sem pii → comportamento idêntico (nada mascarado)', async () => {
    mockChat.mockResolvedValueOnce(reply('pergunta'));
    const { estado } = await abrirArguicao(CTX_PII, 4);
    const seed = mockChat.mock.calls[0][1] as any[];
    expect(seed[0].content).toContain('rodrigo@acme.com'); // cru, sem masking
    expect(estado.historico[0].content).toContain('rodrigo@acme.com');
  });
});
