/**
 * De quem é este telefone? — a DECISÃO, separada da consulta.
 *
 * O número da Cloud API é único para todos os tenants, então quem escreve chega
 * sem tenant. A resolução é pelo telefone, e ela pode ser ambígua: a mesma
 * pessoa (ou o mesmo aparelho) pode estar cadastrada em duas empresas.
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
 * ⚠️ O QUE ESTA FUNÇÃO **NÃO** FAZ, de propósito: variar o nono dígito. O
 * `wa_id` que a Meta manda para número brasileiro pode chegar sem ele, e nesse
 * caso nenhuma variante casa — a mensagem cai na fila de não identificadas, que
 * é o lado seguro. Gerar a variante ampliaria o alcance de um casamento de
 * IDENTIDADE, e isso não se faz sem medir contra tráfego real: um falso
 * positivo aqui entrega conversa para o tenant errado, que é pior que uma linha
 * a mais na fila. Está registrado como pendência em `docs/INBOX-WHATSAPP.md`.
 */
export function variantesDoTelefone(telefone: string): string[] {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return [];
  return [digitos, `+${digitos}`];
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
 */
export function decidirDono(linhas: CandidatoDono[]): DonoResolvido {
  if (!linhas?.length) {
    return { empresaId: null, colaboradorId: null, ambiguidade: 'telefone-desconhecido' };
  }

  const empresas = new Set(linhas.map((c) => c.empresa_id));
  if (empresas.size > 1) {
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
