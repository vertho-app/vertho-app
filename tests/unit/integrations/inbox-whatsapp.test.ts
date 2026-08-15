/**
 * Caixa de entrada do WhatsApp (mig 215, 14/08/2026).
 *
 * O QUE ESTES TESTES PROTEGEM
 * ───────────────────────────
 * 1. **A fronteira de 24h.** É a regra que decide se a UI deixa escrever. Errar
 *    por um milissegundo produz mensagem recusada pela Meta (131047) que, para
 *    quem clicou, simplesmente não chegou. O tempo é CONGELADO aqui — testar
 *    fronteira com `Date.now()` já produziu suíte que muda de cor conforme a
 *    hora em que roda, nesta base.
 * 2. **A thread com os dois lados.** Sem dedup por `wamid`, um envio da inbox
 *    apareceria duas vezes — uma com texto, outra sem — como se fossem
 *    mensagens diferentes.
 * 3. **"Nunca escreveu" ≠ "janela fechada".** Tratar como o mesmo estado faria a
 *    tela dizer que uma conversa expirou quando ela nunca existiu.
 */
import { describe, it, expect } from 'vitest';
import { calcularJanela, restanteLegivel, JANELA_MS } from '@/lib/inbox/janela';
import { montarThread, midiaIdDoRaw } from '@/lib/inbox/thread';

const T0 = Date.parse('2026-08-14T12:00:00.000Z');

describe('janela de 24h — a fronteira decide se pode escrever', () => {
  it('recém-recebida: aberta', () => {
    const j = calcularJanela(new Date(T0).toISOString(), T0 + 60_000);
    expect(j.estado).toBe('aberta');
    expect(j.podeTextoLivre).toBe(true);
  });

  it('23h59: AINDA aberta', () => {
    const j = calcularJanela(new Date(T0).toISOString(), T0 + JANELA_MS - 60_000);
    expect(j.podeTextoLivre).toBe(true);
  });

  it('🔴 exatamente 24h: JÁ fechada', () => {
    // `> 0`, não `>= 0`. No instante exato a Meta recusa com 131047 — habilitar
    // o campo aqui entrega uma mensagem perdida em vez de um bloqueio explicado.
    const j = calcularJanela(new Date(T0).toISOString(), T0 + JANELA_MS);
    expect(j.estado).toBe('fechada');
    expect(j.podeTextoLivre).toBe(false);
    expect(j.restanteMs).toBe(0);
  });

  it('24h01: fechada', () => {
    expect(calcularJanela(new Date(T0).toISOString(), T0 + JANELA_MS + 60_000).podeTextoLivre).toBe(false);
  });

  it('nunca escreveu ≠ fechada — são mensagens diferentes na tela', () => {
    const j = calcularJanela(null, T0);
    expect(j.estado).toBe('nunca-escreveu');
    expect(j.fechaEm).toBeNull();
    expect(j.podeTextoLivre).toBe(false);
  });

  it('data ilegível NÃO vira aberta — o lado seguro de permissão é negar', () => {
    const j = calcularJanela('nao-e-data', T0);
    expect(j.podeTextoLivre).toBe(false);
  });

  it('tempo restante legível, sem segundos', () => {
    expect(restanteLegivel(0)).toBe('encerrada');
    expect(restanteLegivel(30 * 60_000)).toBe('30 min');
    expect(restanteLegivel(90 * 60_000)).toBe('1h30');
    expect(restanteLegivel(2 * 60 * 60_000)).toBe('2h');
  });
});

describe('thread — os dois lados, sem duplicar', () => {
  const recebidas = [
    { id: 'r1', texto: 'Sim', tipo: 'text', recebida_em: '2026-08-14T10:00:00.000Z', raw: {} },
  ];
  const enviadas = [
    {
      id: 'e1', texto: 'Você fez o desafio?', tipo: 'text', template_nome: null,
      autor_email: 'rodrigo@vertho.ai', origem: 'inbox', erro: null,
      enviada_em: '2026-08-14T09:59:00.000Z', wa_message_id: 'wamid.AAA',
    },
  ];
  const entregas = [
    // MESMA mensagem que `e1` — só a telemetria. Não pode virar item novo.
    {
      id: 'd1', kind: 'atendimento', sent_at: '2026-08-14T09:59:00.000Z',
      provider_status: 'read', delivered_at: '2026-08-14T09:59:10.000Z',
      opened_at: '2026-08-14T09:59:40.000Z', error: null, provider_message_id: 'wamid.AAA',
    },
    // Cadência histórica: sem texto, sem correspondência em `enviadas`.
    {
      id: 'd2', kind: 'pilula', sent_at: '2026-08-13T11:00:00.000Z',
      provider_status: 'delivered', delivered_at: '2026-08-13T11:00:20.000Z',
      opened_at: null, error: null, provider_message_id: 'wamid.OLD',
    },
  ];

  const itens = montarThread({ recebidas: recebidas as any, enviadas: enviadas as any, entregas: entregas as any });

  it('ordena do mais antigo ao mais recente', () => {
    expect(itens.map((i) => i.id)).toEqual(['ent:d2', 'env:e1', 'rec:r1']);
  });

  it('🔴 não duplica: envio com texto absorve a telemetria pelo wamid', () => {
    // Sem o dedup, `e1` e `d1` virariam duas bolhas da mesma mensagem.
    expect(itens.filter((i) => i.id.startsWith('env:') || i.id === 'ent:d1')).toHaveLength(1);
    const enviado = itens.find((i) => i.id === 'env:e1')!;
    expect(enviado.texto).toBe('Você fez o desafio?');
    expect(enviado.entregueEm).toBe('2026-08-14T09:59:10.000Z');
    expect(enviado.lidaEm).toBe('2026-08-14T09:59:40.000Z');
  });

  it('cadência histórica entra como rótulo — melhor que buraco na conversa', () => {
    const antiga = itens.find((i) => i.id === 'ent:d2')!;
    expect(antiga.texto).toBeNull();
    expect(antiga.rotulo).toBe('pilula');
    expect(antiga.autor).toBe('sistema');
  });

  it('separa resposta humana de disparo automático', () => {
    expect(itens.find((i) => i.id === 'env:e1')!.autor).toBe('equipe');
    expect(itens.find((i) => i.id === 'ent:d2')!.autor).toBe('sistema');
    expect(itens.find((i) => i.id === 'rec:r1')!.autor).toBe('pessoa');
  });

  it('envio que FALHOU aparece na thread', () => {
    // Se não aparecer, o atendente reescreve sem saber que já tentou — e a
    // pessoa pode receber duas.
    const t = montarThread({
      recebidas: [] as any,
      enviadas: [{
        id: 'x', texto: 'oi', tipo: 'text', template_nome: null, autor_email: 'a@b.c',
        origem: 'inbox', erro: 'Cloud API HTTP 400: 131047', enviada_em: '2026-08-14T12:00:00.000Z',
        wa_message_id: null,
      }] as any,
      entregas: [] as any,
    });
    expect(t[0]!.erro).toContain('131047');
  });
});

describe('mídia — áudio precisa ser ouvível', () => {
  it.each([
    ['audio', { audio: { id: '123456789' } }],
    ['image', { image: { id: '987654321' } }],
    ['document', { document: { id: '111222333' } }],
  ])('extrai o id de %s', (_t, raw) => {
    expect(midiaIdDoRaw(raw)).toMatch(/^\d+$/);
  });

  it('texto puro não tem mídia', () => {
    expect(midiaIdDoRaw({ text: { body: 'oi' } })).toBeNull();
    expect(midiaIdDoRaw(null)).toBeNull();
  });
});

/**
 * 🔴 O anexo que NÓS mandamos também precisa aparecer.
 *
 * A extração de mídia só rodava sobre as recebidas: um documento enviado pela
 * caixa saía para a pessoa e, na thread, virava "(sem conteúdo)". A conversa
 * mostrava metade do que aconteceu — e é assim que o atendente reenvia o mesmo
 * arquivo achando que não foi.
 *
 * O envio grava `raw` no MESMO formato da Meta (`{ document: { id } }`), então a
 * mesma função serve os dois lados e o proxy autenticado serve os dois ids.
 */
describe('anexo enviado na thread', () => {
  const enviada = (over: any = {}) => ({
    id: 'e1', texto: null, tipo: 'document', template_nome: null,
    autor_email: 'equipe@vertho.ai', origem: 'inbox', erro: null,
    enviada_em: '2026-08-15T12:00:00Z', wa_message_id: 'wamid.OUT1',
    raw: { document: { id: '445566778899' }, filename: 'contrato.pdf' },
    ...over,
  });

  it('extrai o id da mídia do que foi ENVIADO', () => {
    const [item] = montarThread({ recebidas: [], enviadas: [enviada()], entregas: [] });
    expect(item.midiaId).toBe('445566778899');
    expect(item.autor).toBe('equipe');
  });

  it('anexo com legenda mantém o texto E a mídia', () => {
    const [item] = montarThread({ recebidas: [], enviadas: [enviada({ texto: 'segue o contrato' })], entregas: [] });
    expect(item.texto).toBe('segue o contrato');
    expect(item.midiaId).toBe('445566778899');
  });

  it('envio de texto puro continua sem mídia', () => {
    const [item] = montarThread({
      recebidas: [], entregas: [],
      enviadas: [enviada({ tipo: 'text', texto: 'oi', raw: null })],
    });
    expect(item.midiaId).toBeNull();
  });

  it('upload que falhou aparece como tentativa, com o erro e sem mídia', () => {
    const [item] = montarThread({
      recebidas: [], entregas: [],
      enviadas: [enviada({ wa_message_id: null, erro: 'upload HTTP 400', raw: { filename: 'contrato.pdf' } })],
    });
    expect(item.erro).toBe('upload HTTP 400');
    expect(item.midiaId).toBeNull();
  });
});
