// O texto que acompanha o link do Beto e a situação que vai ao modelo.
//
// 🔴 Os horários abaixo são os REAIS de 25/09/2026 (UTC no banco): link às
// 11:55:13Z, sessão criada às 11:55:49Z, pedido de novo link às 12:33Z. Em
// Brasília, 08:55 e 09:33. Um texto que dissesse "11:55" estaria certo no banco
// e errado para a pessoa.
import { describe, it, expect } from 'vitest';
import {
  casoDoLink,
  quandoBrt,
  situacaoParaContexto,
  textoAoEnviarLink,
} from '@/lib/whatsapp/suporte-situacao';

const LINK = '2026-09-25T11:55:13.774Z';
const LOGIN = '2026-09-25T11:55:49.801Z';
const PEDIDO = Date.parse('2026-09-25T12:33:09Z');

describe('o que aconteceu com o link anterior', () => {
  it('🔴 caso real: entrou 36 s depois do link, então o link foi USADO', () => {
    expect(casoDoLink({ ultimoLinkEm: LINK, ultimoLoginEm: LOGIN }, PEDIDO)).toBe('anterior-usado');
  });

  it('sem login depois do link e passados 15 min: expirou', () => {
    expect(casoDoLink({ ultimoLinkEm: LINK, ultimoLoginEm: null }, PEDIDO)).toBe('anterior-expirado');
    // Login de 04/09 é anterior ao link: não foi com ele.
    expect(casoDoLink({ ultimoLinkEm: LINK, ultimoLoginEm: '2026-09-04T19:03:54Z' }, PEDIDO)).toBe('anterior-expirado');
  });

  it('login 30 min depois do link não foi com ele (o link já tinha vencido)', () => {
    expect(casoDoLink({ ultimoLinkEm: LINK, ultimoLoginEm: '2026-09-25T12:25:13Z' }, PEDIDO)).toBe('anterior-expirado');
  });

  it('link de 10 min atrás, sem login: ainda vale', () => {
    const agora = Date.parse(LINK) + 10 * 60 * 1000;
    expect(casoDoLink({ ultimoLinkEm: LINK, ultimoLoginEm: null }, agora)).toBe('anterior-valendo');
  });

  it('sem link nas últimas 24 h: é o primeiro', () => {
    expect(casoDoLink({ ultimoLinkEm: null, ultimoLoginEm: LOGIN }, PEDIDO)).toBe('primeiro');
  });
});

describe('o texto que sai depois do template', () => {
  it('🔴 caso real: explica que o link já foi usado, no horário de Brasília', () => {
    const t = textoAoEnviarLink({ ultimoLinkEm: LINK, ultimoLoginEm: LOGIN }, PEDIDO);
    expect(t).toContain('O link das 08:55 já foi usado: você entrou às 08:55');
    expect(t).toContain('cada link abre uma vez só');
    expect(t).not.toContain('11:55');
  });

  it('🔴 "Qual é a senha pra entrar?": o primeiro link diz que não há senha', () => {
    const t = textoAoEnviarLink({ ultimoLinkEm: null, ultimoLoginEm: null }, PEDIDO);
    expect(t).toContain('não precisa de senha');
    expect(t).toContain('15 minutos');
  });

  it('link vencido diz que expirou e por quê', () => {
    const t = textoAoEnviarLink({ ultimoLinkEm: LINK, ultimoLoginEm: null }, PEDIDO);
    expect(t).toContain('O link das 08:55 expirou: cada link vale por 15 minutos');
  });

  it('link ainda valendo: manda usar o mais recente, sem dizer que o outro morreu', () => {
    const agora = Date.parse(LINK) + 10 * 60 * 1000;
    const t = textoAoEnviarLink({ ultimoLinkEm: LINK, ultimoLoginEm: null }, agora);
    expect(t).toContain('use este, que é o mais recente');
    expect(t).not.toContain('expirou');
  });

  it('🔴 virada do dia em Brasília: 23:30 de ontem, embora o UTC seja o mesmo dia', () => {
    // 02:30Z e 03:10Z são o mesmo dia em UTC, e dias diferentes em Brasília.
    const t = textoAoEnviarLink(
      { ultimoLinkEm: '2026-09-25T02:30:00Z', ultimoLoginEm: null },
      Date.parse('2026-09-25T03:10:00Z'),
    );
    expect(t).toContain('O link de ontem, das 23:30');
  });

  it('nenhum texto aponta posição nem traz link (são dois envios, sem ordem garantida)', () => {
    const casos = [
      { ultimoLinkEm: null, ultimoLoginEm: null },
      { ultimoLinkEm: LINK, ultimoLoginEm: LOGIN },
      { ultimoLinkEm: LINK, ultimoLoginEm: null },
    ];
    for (const c of casos) {
      const t = textoAoEnviarLink(c, PEDIDO);
      expect(t).not.toMatch(/acima|abaixo|https?:/i);
      expect(t.length).toBeLessThan(500);
    }
  });
});

describe('a situação que vai ao modelo', () => {
  it('🔴 caso real: sem trilha, mapeada, horários em Brasília', () => {
    const s = situacaoParaContexto({
      trilhas: [],
      mapeamentoEm: '2026-09-04T19:03:54Z',
      ultimoLoginEm: LOGIN,
      loginDesconhecido: false,
      ultimoLinkEm: LINK,
    }, PEDIDO);
    expect(s).toEqual({
      trilha: 'nenhuma',
      mapeamento_comportamental: 'feito',
      ultimo_login: 'hoje às 08:55',
      ultimo_link_de_acesso_24h: 'hoje às 08:55',
    });
  });

  it('qualquer trilha ativa vence; senão, a mais recente', () => {
    const base = { ultimoLoginEm: null, loginDesconhecido: false, ultimoLinkEm: null };
    expect(situacaoParaContexto({ ...base, trilhas: ['concluida', 'ativa'] }, PEDIDO).trilha).toBe('ativa');
    expect(situacaoParaContexto({ ...base, trilhas: ['concluida', 'pausada'] }, PEDIDO).trilha).toBe('concluida');
  });

  it('leitura que falhou vira "desconhecida", nunca "nenhuma" nem "sem registro"', () => {
    const s = situacaoParaContexto({
      trilhas: null, ultimoLoginEm: null, loginDesconhecido: true, ultimoLinkEm: null,
    }, PEDIDO);
    expect(s.trilha).toBe('desconhecida');
    expect(s.ultimo_login).toBe('desconhecido');
    // Sem `mapeamentoEm` (equipe interna) não se afirma nada.
    expect(s.mapeamento_comportamental).toBe('desconhecido');
  });

  it('login antigo sai com a data', () => {
    expect(quandoBrt('2026-09-04T19:03:54Z', PEDIDO)).toBe('04/09 às 16:03');
  });
});
