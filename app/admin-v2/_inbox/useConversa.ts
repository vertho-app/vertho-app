'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { carregarThread, responderConversa, marcarLida, responderComAnexo } from '../cliente/inbox-actions';
import {
  chaveDaConversa, lerRascunho, gravarRascunho, criarControleDePedidos,
  type Alvo, type Rascunhos,
} from '@/lib/inbox/rascunhos';
import type { ThreadCompleta, ResultadoEnvio } from '@/lib/inbox/tipos';

export type { Alvo };

/**
 * Estado de "a conversa aberta" — compartilhado pela caixa do cliente e pela
 * caixa da equipe.
 *
 * Vive num hook e não em cada tela porque as duas correções abaixo são de
 * COMPORTAMENTO, e comportamento duplicado diverge: a segunda tela nasceria com
 * os bugs que a primeira acabou de perder.
 *
 * 🔴 1. O RASCUNHO É POR CONVERSA. Um único `texto` no componente pai produz o
 * pior erro possível numa caixa de atendimento: escrever para A, clicar em B e
 * enviar para B o que era para A. Nada na tela avisa — o texto continua lá,
 * parecendo o mesmo campo. Aqui cada conversa guarda o seu, e trocar de conversa
 * preserva os dois em vez de vazar um no outro.
 *
 * 🔴 2. RESPOSTA ATRASADA NÃO SOBRESCREVE A THREAD ATIVA. O polling de 15s e o
 * clique disputam a mesma variável de estado; a rede não devolve na ordem em que
 * foi pedida. Sem o controle de pedidos, a thread da conversa anterior chega
 * depois e substitui a que está aberta — e quem atende lê a conversa de outra
 * pessoa acreditando que é desta. Cada pedido leva um número; quem volta velho é
 * descartado.
 *
 * Os dois mecanismos vivem em `lib/inbox/rascunhos.ts`, fora do React: a suíte
 * roda em ambiente `node` e sem eles ali estas duas regras não teriam como ser
 * exercitadas por teste nenhum.
 */

export function useConversa(aoMudarLista?: () => void) {
  const [ativa, setAtiva] = useState<Alvo | null>(null);
  const [thread, setThread] = useState<ThreadCompleta | null>(null);
  const [rascunhos, setRascunhos] = useState<Rascunhos>({});
  // O anexo também é POR CONVERSA, pelo mesmo motivo do rascunho — e aqui o
  // estrago seria maior: escolher um arquivo, trocar de conversa e enviar
  // mandaria o documento de um cliente para outro.
  const [anexos, setAnexos] = useState<Record<string, File>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, startEnvio] = useTransition();

  /** Resposta de pedido ultrapassado é lixo, não estado. */
  const pedidos = useRef(criarControleDePedidos());

  const carregar = useCallback(async (alvo: Alvo, marcar: boolean) => {
    const meu = pedidos.current.novo();
    try {
      const t = await carregarThread(alvo.empresaId, alvo.telefone);
      if (!pedidos.current.aindaVale(meu)) return; // chegou depois de um pedido mais novo
      setThread(t);
      if (marcar) {
        await marcarLida(alvo.empresaId, alvo.telefone);
        aoMudarLista?.();
      }
    } catch (e: any) {
      if (pedidos.current.aindaVale(meu)) setAviso(e?.message || 'Falha ao abrir a conversa.');
    }
  }, [aoMudarLista]);

  const abrir = useCallback((alvo: Alvo) => {
    setAtiva(alvo);
    // Limpa a thread anterior: manter a antiga na tela enquanto a nova carrega é
    // mostrar a conversa errada sob o nome certo.
    setThread(null);
    setAviso(null);
    void carregar(alvo, true);
  }, [carregar]);

  const atualizar = useCallback(() => {
    if (ativa) void carregar(ativa, false);
  }, [ativa, carregar]);

  const rascunho = lerRascunho(rascunhos, ativa);

  const escrever = useCallback((valor: string) => {
    if (!ativa) return;
    setRascunhos((r) => gravarRascunho(r, ativa, valor));
  }, [ativa]);

  const enviar = useCallback(() => {
    if (!ativa) return;
    const alvo = ativa;
    const corpo = lerRascunho(rascunhos, alvo).trim();
    if (!corpo) return;

    // Idempotência: o mesmo conteúdo, na mesma conversa, dentro do mesmo minuto
    // é duplo clique — não uma segunda mensagem deliberada.
    const dedupeKey = `inbox:${alvo.telefone}:${corpo.slice(0, 40)}:${Math.floor(Date.now() / 60000)}`;
    setAviso(null);

    startEnvio(async () => {
      const r: ResultadoEnvio = await responderConversa({
        empresaId: alvo.empresaId,
        telefone: alvo.telefone,
        texto: corpo,
        dedupeKey,
      });

      if (!r.ok) {
        setAviso(r.motivo || 'Falha ao enviar.');
        // Janela fechada ENTRE a renderização e o envio: recarrega para o campo
        // sumir, senão a tela segue oferecendo o que já não vale.
        if (r.janelaFechada) await carregar(alvo, false);
        return;
      }

      // Limpa o rascunho DA CONVERSA QUE ENVIOU, não "o campo": entre o clique e
      // a resposta a pessoa pode já ter aberto outra conversa e começado a
      // escrever nela.
      setRascunhos((rs) => gravarRascunho(rs, alvo, ''));
      await carregar(alvo, false);
      aoMudarLista?.();
    });
  }, [ativa, rascunhos, carregar, aoMudarLista]);

  const anexo = ativa ? anexos[chaveDaConversa(ativa)] ?? null : null;

  const anexar = useCallback((arquivo: File | null) => {
    if (!ativa) return;
    const k = chaveDaConversa(ativa);
    setAviso(null);
    setAnexos((a) => {
      const proximo = { ...a };
      if (arquivo) proximo[k] = arquivo; else delete proximo[k];
      return proximo;
    });
  }, [ativa]);

  /**
   * Envia o anexo da conversa aberta, com o rascunho virando legenda.
   *
   * A validação de tipo/tamanho fica no SERVIDOR (`classificarMidia`): o input
   * `accept` só evita o incômodo de escolher o que seria recusado — quem decide
   * não pode ser o cliente.
   */
  const enviarAnexo = useCallback(() => {
    if (!ativa) return;
    const alvo = ativa;
    const arquivo = anexos[chaveDaConversa(alvo)];
    if (!arquivo) return;

    const legenda = lerRascunho(rascunhos, alvo).trim();
    const dedupeKey = `inbox:${alvo.telefone}:anexo:${arquivo.name}:${arquivo.size}:${Math.floor(Date.now() / 60000)}`;
    setAviso(null);

    startEnvio(async () => {
      const form = new FormData();
      form.append('empresaId', alvo.empresaId);
      form.append('telefone', alvo.telefone);
      form.append('legenda', legenda);
      form.append('dedupeKey', dedupeKey);
      form.append('arquivo', arquivo);

      const r: ResultadoEnvio = await responderComAnexo(form);
      if (!r.ok) {
        setAviso(r.motivo || 'Falha ao enviar o arquivo.');
        if (r.janelaFechada) await carregar(alvo, false);
        return;
      }

      // Some com o anexo E com a legenda DAQUELA conversa — as duas coisas já
      // saíram juntas, e deixar a legenda no campo faria a próxima mensagem
      // repetir o texto do arquivo.
      setAnexos((a) => { const p = { ...a }; delete p[chaveDaConversa(alvo)]; return p; });
      setRascunhos((rs) => gravarRascunho(rs, alvo, ''));
      await carregar(alvo, false);
      aoMudarLista?.();
    });
  }, [ativa, anexos, rascunhos, carregar, aoMudarLista]);

  const estaAtiva = useCallback(
    (alvo: Alvo) => Boolean(ativa && chaveDaConversa(ativa) === chaveDaConversa(alvo)),
    [ativa],
  );

  return {
    ativa, thread, aviso, setAviso, rascunho, escrever, enviar, enviando, abrir, atualizar, estaAtiva,
    anexo, anexar, enviarAnexo,
  };
}
