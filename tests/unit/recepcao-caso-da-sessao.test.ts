/**
 * A-2 da revisão de 27/09/2026: "Praticar novamente" repete o caso E o degrau
 * do atendimento na tela.
 *
 * O mesmo caso tem três degraus publicados; casar só pelo caso devolvia o
 * primeiro da lista (Introdução) depois de um relatório do Limite. A tela
 * (`components/recepcao/treino.tsx`) usa `registroDaSessao`; a verificação de
 * tela está em `scripts/verify-recepcao-ui.mjs` (bloco A-2).
 */
import { describe, expect, it } from 'vitest';
import { registroDaSessao } from '@/lib/recepcao/caso-da-sessao';
import { abrirSessao, fichaPublica, ordenarPorNivel, visaoPublica } from '@/lib/recepcao/core';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { catalogoDesafiador } from '@/lib/recepcao/catalogo-desafiador';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';

const caso = (lista: any[]) => aplicarMatrizAtendimento(structuredClone(lista.find((c) => c.id === 'primeira-consulta')!));
const DEGRAUS = { 'reg-intro': caso(catalogoInicial), 'reg-pressao': caso(catalogoDesafiador), 'reg-limite': caso(catalogoLimites) };
const publicados = (ids = Object.keys(DEGRAUS), extra: any[] = []) =>
  ordenarPorNivel([
    ...ids.map((id) => ({ id, versao: DEGRAUS[id].versao, ficha: fichaPublica(DEGRAUS[id]) })),
    ...extra,
  ]);
function sessaoNoLimite() {
  const s = abrirSessao(DEGRAUS['reg-limite'], 0);
  s.cenarioRegistroId = 'reg-limite';
  return visaoPublica(s);
}

describe('A-2: a versão publicada do atendimento na tela', () => {
  it('a visão pública expõe o registro em que a sessão nasceu', () => {
    expect(sessaoNoLimite().cenarioRegistroId).toBe('reg-limite');
    expect(visaoPublica(abrirSessao(DEGRAUS['reg-intro'], 0)).cenarioRegistroId).toBeNull();
  });

  it('relatório do Limite volta ao Limite, não ao primeiro degrau do mesmo caso', () => {
    const lista = publicados();
    // Pré-condição do defeito: a Introdução vem primeiro e tem o mesmo caso.
    expect(lista[0].id).toBe('reg-intro');
    expect(new Set(lista.map((r) => r.ficha.cenarioId)).size).toBe(1);
    expect(registroDaSessao(lista, sessaoNoLimite())?.id).toBe('reg-limite');
  });

  it('sem o registro exato, usa a versão nova do MESMO caso e degrau', () => {
    const nova = { id: 'reg-limite-34', versao: '3.4', ficha: fichaPublica(DEGRAUS['reg-limite']) };
    const lista = publicados(['reg-intro', 'reg-pressao'], [nova]);
    expect(registroDaSessao(lista, sessaoNoLimite())?.id).toBe('reg-limite-34');
  });

  it('caso que saiu do catálogo devolve null: nada de trocar pelo degrau vizinho', () => {
    expect(registroDaSessao(publicados(['reg-intro', 'reg-pressao']), sessaoNoLimite())).toBeNull();
    expect(registroDaSessao([], sessaoNoLimite())).toBeNull();
    expect(registroDaSessao(publicados(), null)).toBeNull();
  });
});
