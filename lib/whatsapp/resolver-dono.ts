/**
 * De quem é este telefone? — a DECISÃO, separada da consulta.
 *
 * Quem escreve chega sem tenant: o número inicial da Cloud API atende todos os
 * tenants que não têm número próprio. A resolução é pelo telefone, e ela pode
 * ser ambígua: a mesma pessoa (ou o mesmo aparelho) pode estar cadastrada em
 * duas empresas. Desde 21/10/2026 o NÚMERO QUE RECEBEU desempata, quando é um
 * número próprio de empresa (ver `decidirDono`).
 *
 * 🔴 POR QUE ISTO VIROU FUNÇÃO PURA (15/08/2026)
 * ──────────────────────────────────────────────
 * A versão anterior decidia sobre `.limit(5)` — e essa é a diferença entre um
 * invariante e uma AMOSTRA. Sem `ORDER BY`, o Postgres devolve cinco linhas
 * quaisquer; se as cinco caírem na mesma empresa enquanto existe uma sexta em
 * outra, `new Set(empresa_id).size === 1` e a mensagem é atribuída a UM TENANT
 * ERRADO — a mensagem de um colaborador aparecendo no painel de outro cliente,
 * que é exatamente o que o isolamento desta base existe para impedir.
 *
 * Medido no dia em que isto foi corrigido: um telefone aparece em **7 pessoas /
 * 6 empresas** no cadastro, e outros dois em 4 empresas cada. A garantia dependia
 * de sorte na amostragem. Agora a consulta traz TODAS as linhas que casam (um
 * telefone casa com um punhado, não com volume) e a decisão é sobre o conjunto
 * inteiro — testável sem banco, que é o outro motivo de estar aqui.
 *
 * A regra, que não mudou: chutar um tenant é pior que não resolver. Lacuna
 * contável é preferível a atribuição errada.
 */
import { formasDoTelefone } from './nono-digito';

export interface CandidatoDono {
  id: string;
  empresa_id: string | null;
}

export interface DonoResolvido {
  empresaId: string | null;
  colaboradorId: string | null;
  /** `null` quando resolveu limpo. Preenchido = motivo de ter ficado sem dono. */
  ambiguidade: string | null;
}

/**
 * Variantes do telefone para casar com o cadastro.
 *
 * O cadastro é normalizado em E.164 SEM o "+" (convenção de `lib/phone.ts`), mas
 * o "+" aparece em dado importado de fora, então as duas formas são tentadas.
 *
 * 🔴 O NONO DÍGITO ENTROU EM 17/08/2026 — e a decisão anterior era o oposto.
 * ─────────────────────────────────────────────────────────────────────────
 * Até aqui esta função NÃO variava o nono dígito, com o argumento de que ampliar
 * um casamento de IDENTIDADE sem medir contra tráfego real pode entregar
 * conversa ao tenant errado. O argumento continua válido; o que faltava era a
 * medição, e ela chegou junto com o primeiro tráfego real de verdade:
 *
 *   - o `wa_id` de todo DDD ≥ 31 chega SEM o nono (36 de 44 envios com wamid);
 *   - 2 de 2 respostas recebidas naquela manhã ficaram `telefone-desconhecido`
 *     — de duas professoras para quem o app tinha acabado de entregar a pílula;
 *   - **50 pessoas** de Ibipeba estavam nessa faixa, ou seja, a caixa nunca
 *     reconheceria nenhuma delas;
 *   - e o teste que faltava: normalizando o nono dígito, **0 dos ~350 telefones
 *     do cadastro** passam a colidir com outro que hoje é distinto.
 *
 * O risco que sobra é coberto por `decidirDono`, que não escolhe no empate: uma
 * variante que casasse duas empresas deixa a conversa SEM dono, na fila. A régua
 * do dígito vive em `nono-digito.ts`, sem dependência, porque roda no webhook.
 */
export function variantesDoTelefone(telefone: string): string[] {
  return formasDoTelefone(telefone).flatMap((d) => [d, `+${d}`]);
}

/**
 * Filtro `.or()` do PostgREST para as colunas de telefone.
 *
 * Vazio quando não há dígitos — o chamador precisa tratar, porque um `.or('')`
 * não filtra nada e devolveria a tabela inteira.
 */
export function filtroDeTelefone(telefone: string): string {
  const variantes = variantesDoTelefone(telefone);
  if (!variantes.length) return '';
  return variantes.flatMap((v) => [`whatsapp.eq.${v}`, `telefone.eq.${v}`]).join(',');
}

/**
 * Decide o dono a partir de TODAS as linhas que casaram com o telefone.
 *
 * Três desfechos, e os três importam:
 *   - nenhuma linha            → `telefone-desconhecido`
 *   - linhas em 2+ empresas    → `telefone-em-multiplas-empresas` (sem dono)
 *   - linhas em 1 empresa, mas 2+ pessoas → empresa resolvida, PESSOA não
 *
 * O terceiro caso é novo e vale a explicação: o tenant é inequívoco (todas as
 * linhas apontam para a mesma empresa), então a conversa PODE aparecer na caixa
 * daquele cliente — não há vazamento. O que não dá para fazer é escolher entre
 * duas pessoas do mesmo tenant que compartilham o número; a versão anterior
 * pegava `data[0]`, isto é, sorteava. Carimbar a pessoa errada numa thread é
 * afirmar um fato que ninguém verificou, e ele vira histórico.
 *
 * 🔑 O NÚMERO QUE RECEBEU DESEMPATA (21/10/2026). `empresasDoNumero` são as
 * empresas ligadas ao número para o qual a pessoa escreveu (a função de mesmo
 * nome em `numeros.ts`, a partir do `to_phone_id`). Com o telefone em 2+ empresas,
 * a decisão fica só com as linhas dessas empresas: sobrando UMA, é dela (quem
 * responde à pílula da 4Life pelo número da 4Life está falando com a 4Life).
 * Caso medido: uma professora interna em 6 empresas tinha as pílulas na conversa
 * da 4Life e as próprias respostas na fila sem dono. O que NÃO muda: o filtro só
 * estreita, nunca atribui empresa em que o telefone não está; sobrando 0 ou 2+,
 * segue ambíguo; o número inicial (lista vazia) não desempata; e telefone de uma
 * empresa só resolve como antes, sem olhar o número.
 */
export function decidirDono(linhas: CandidatoDono[], empresasDoNumero?: readonly string[] | null): DonoResolvido {
  if (!linhas?.length) {
    return { empresaId: null, colaboradorId: null, ambiguidade: 'telefone-desconhecido' };
  }

  const empresas = new Set(linhas.map((c) => c.empresa_id));
  if (empresas.size > 1) {
    const doNumero = new Set(empresasDoNumero ?? []);
    const daquelas = doNumero.size ? linhas.filter((c) => c.empresa_id !== null && doNumero.has(c.empresa_id)) : [];
    if (daquelas.length && new Set(daquelas.map((c) => c.empresa_id)).size === 1) return decidirDono(daquelas);
    return { empresaId: null, colaboradorId: null, ambiguidade: 'telefone-em-multiplas-empresas' };
  }

  const empresaId = linhas[0].empresa_id ?? null;
  const pessoas = new Set(linhas.map((c) => c.id));
  if (pessoas.size > 1) {
    return { empresaId, colaboradorId: null, ambiguidade: 'telefone-em-multiplas-pessoas' };
  }

  return { empresaId, colaboradorId: linhas[0].id, ambiguidade: null };
}

/** Ficou sem dono? É o que decide se a linha entra na fila de não identificadas. */
export function semDono(d: DonoResolvido): boolean {
  return d.empresaId === null;
}
