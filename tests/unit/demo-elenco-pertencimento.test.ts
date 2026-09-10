import { describe, it, expect } from 'vitest';
import { ACME_DEMO_ELENCO_EMAILS, ehDoElencoAcme } from '@/lib/demo/acme-elenco';
import { ACME_DEMO_TEAM_SIZE } from '@/lib/demo/acme-rh-report-fixture';

/**
 * O elenco do ACME Demo, contado por PERTENCIMENTO.
 *
 * 🔴 `Medido: 09/09/2026` — as duas asserções de sanidade do reset contavam
 * "todo mundo menos as exceções". O convidado de degustação passou a atravessar
 * o reset (03/09), virou linha em `colaboradores`, e a conta deu **33 contra
 * 30**. Como a asserção roda depois do wipe e do seed, ela não protegeu nada:
 * abortou a geração dos relatórios e deixou o ambiente com **3 de 35**, com a
 * central do RH em "Leitura analítica ainda não disponível".
 *
 * A correção da época excluiu o prefixo `convidado.` — caso resolvido, classe
 * de pé. Estes casos protegem a inversão: o conjunto é FECHADO (quem está
 * declarado), então ator novo nunca mais entra na conta, e a asserção continua
 * pegando o defeito que ela existe para pegar (elenco incompleto).
 */

describe('elenco declarado do ACME Demo', () => {
  it('o conjunto tem os participantes + a administradora', () => {
    // 30 participantes (`ACME_DEMO_TEAM_SIZE`) + 1 `rh`. Se alguém adicionar
    // persona ao roster sem mexer no TEAM_SIZE, esta linha cai — e cair aqui é
    // muito mais barato que cair no meio do reset noturno.
    expect(ACME_DEMO_ELENCO_EMAILS.size).toBe(ACME_DEMO_TEAM_SIZE + 1);
  });

  it('reconhece quem é do elenco, com caixa e espaço tolerados', () => {
    expect(ehDoElencoAcme('lucas.demo@vertho.ai')).toBe(true);
    expect(ehDoElencoAcme('  LUCAS.DEMO@VERTHO.AI  ')).toBe(true);
    expect(ehDoElencoAcme('helena.demo@vertho.ai')).toBe(true);
  });

  it('🔴 nenhum ATOR NOVO entra na conta — nem os que ainda não existem', () => {
    // Convidado de degustação: o caso que derrubou o reset em 09/09.
    expect(ehDoElencoAcme('convidado.acme.e6e69c576531aa5c7195@vertho.ai')).toBe(false);
    // Conta de verificação do E2E: criada em 10/09, no gruposinal. Se um dia
    // existir uma equivalente aqui, ela não pode virar participante.
    expect(ehDoElencoAcme('smoke-e2e.demo@vertho.ai')).toBe(false);
    // Formas que uma lista de exceções por prefixo NÃO teria previsto.
    expect(ehDoElencoAcme('integracao@parceiro.com')).toBe(false);
    expect(ehDoElencoAcme('suporte.demo@vertho.ai')).toBe(false);
    expect(ehDoElencoAcme('Convidado.Acme.XYZ@vertho.ai')).toBe(false);
  });

  it('vazio e lixo não pertencem (e não explodem)', () => {
    expect(ehDoElencoAcme('')).toBe(false);
    expect(ehDoElencoAcme(null)).toBe(false);
    expect(ehDoElencoAcme(undefined)).toBe(false);
    expect(ehDoElencoAcme({})).toBe(false);
  });

  it('🔴 a asserção AINDA pega elenco incompleto — é para isso que ela existe', () => {
    // Simula o que as duas asserções fazem: contar os participantes presentes.
    const contarParticipantes = (emails: string[]) =>
      emails.filter((e) => ehDoElencoAcme(e)).length;

    const elencoInteiro = [...ACME_DEMO_ELENCO_EMAILS].filter((e) => e !== 'helena.demo@vertho.ai');
    expect(contarParticipantes(elencoInteiro)).toBe(ACME_DEMO_TEAM_SIZE);

    // Faltando uma pessoa (seed incompleto), a conta acusa.
    expect(contarParticipantes(elencoInteiro.slice(1))).not.toBe(ACME_DEMO_TEAM_SIZE);

    // Com o elenco inteiro MAIS atores de fora, a conta continua fechando —
    // era exatamente aqui que o reset quebrava.
    const comIntrusos = [
      ...elencoInteiro,
      'convidado.acme.aaa@vertho.ai',
      'convidado.acme.bbb@vertho.ai',
      'smoke-e2e.demo@vertho.ai',
    ];
    expect(contarParticipantes(comIntrusos)).toBe(ACME_DEMO_TEAM_SIZE);
  });
});
