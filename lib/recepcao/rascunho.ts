import 'server-only';
/**
 * Rascunho de caso por IA (18/09/2026): um segmento novo nasce sem casos, e
 * escrever o primeiro do zero trava a adoção. Quem cuida do conteúdo descreve a
 * situação; a IA devolve as PARTES do caso e o código monta o resto (matriz do
 * segmento, ocorrências, desfechos, aviso, limites). O resultado vai para o
 * editor como rascunho NÃO salvo: nada é publicado sem revisão humana.
 */
import { z } from 'zod';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';
import { parseJsonIA } from '@/lib/ai-json';
import { RecepcaoError, type ContextoRecepcao } from './access';
import { dominioAtendimento } from './dominio';
import { LIMITES_PADRAO, montarCaso } from './caso-em-branco';
import { cenarioSchema, type Cenario } from './schema';

const frase = (max: number) => z.string().trim().min(3).max(max);
const pessoaSchema = z.object({
  nome: frase(40),
  abertura: frase(600),
  comportamento: frase(1200),
  fatos: z.array(frase(600)).min(1).max(6),
});
export const rascunhoIaSchema = z.object({
  titulo: frase(80),
  objetivo: frase(600),
  contexto: frase(1500),
  agora: z.string().trim().max(120).nullable().optional(),
  secoes: z.array(z.object({ titulo: frase(120), itens: z.array(frase(600)).min(1).max(8) })).max(4),
  procedimentos: z.array(frase(600)).min(2).max(10),
  pessoa: pessoaSchema,
  variante: pessoaSchema,
  criterios: z.object({
    acolhimento: frase(600),
    compreensao: frase(600),
    clareza: frase(600),
    resolucao: frase(600),
    procedimentos: frase(600),
  }),
});

// O EXEMPLO manda mais que a prosa (memória de 11/09): ele mostra a FORMA com
// marcadores, para o modelo não copiar conteúdo de um caso real.
const EXEMPLO = `{
 "titulo": "<título curto do caso, até 60 caracteres>",
 "objetivo": "<o que quem atende precisa conseguir nesta conversa>",
 "contexto": "<o que quem atende sabe ao abrir a conversa, em 2 a 4 frases>",
 "agora": "<data e hora simuladas, por exemplo 14/09/2026 às 10h>",
 "secoes": [{"titulo": "<por exemplo: Informações disponíveis>", "itens": ["<fato que quem atende pode verificar>"]}],
 "procedimentos": ["<o que quem atende pode fazer>", "<o que não pode fazer nem prometer>", "<como encaminhar ou encerrar>"],
 "pessoa": {"nome": "<primeiro nome>", "abertura": "<primeira fala, já com a demanda>", "comportamento": "<tom, pressa, o que incomoda e o que faria aceitar uma saída>", "fatos": ["<restrição que só revela se perguntada>", "<o que aceita e em que condição>"]},
 "variante": {"nome": "<outro primeiro nome>", "abertura": "<outra forma de abrir a mesma demanda>", "comportamento": "<outro jeito de reagir>", "fatos": ["<mesma restrição, dita de outro jeito>"]},
 "criterios": {"acolhimento": "<o que observar neste caso>", "compreensao": "<...>", "clareza": "<...>", "resolucao": "<...>", "procedimentos": "<...>"}
}`;

export function promptRascunho(dominio: string) {
  const d = dominioAtendimento(dominio);
  return `Você escreve casos de treino para um simulador de ${d.treino}. Quem treina é ${d.aAtendente}; a IA faz o papel ${d.daAtendida}, ${d.personaFicticia}.
O caso é FICTÍCIO: pessoas, empresa, datas e procedimentos inventados, sem marcas reais, sem dados pessoais reais e sem exigir conhecimento técnico de profissão.
Um bom caso tem: uma demanda concreta; uma restrição da pessoa que só aparece se quem atende perguntar; um limite do procedimento que precisa ser explicado; pelo menos uma saída autorizada; e fatos que a pessoa revela quando perguntada. Nada de pegadinha: tudo que quem atende precisa saber está no contexto, nas seções ou nos procedimentos.
Os critérios dizem o que observar NESTE caso em cada competência: acolhimento (reconhecer a situação e manter o respeito), compreensão (descobrir a necessidade e as restrições), clareza (informar sem ambiguidade), resolução (combinar uma saída ou encerrar conforme o procedimento) e procedimentos (seguir a ficha e proteger informações).
Responda somente com JSON na forma do exemplo, em português do Brasil. Os sinais < > marcam o que você deve escrever; não copie o texto deles.
EXEMPLO:
${EXEMPLO}`;
}

export async function gerarRascunho(c: ContextoRecepcao, descricao: string): Promise<Cenario> {
  const model = await getModelForTask(c.empresaId, 'recepcao_rascunho');
  let raw: string;
  try {
    raw = await callAI(promptRascunho(c.dominio), `Situação que a empresa quer treinar:\n${descricao}`, { model }, 6000, {
      taskKey: 'recepcao_rascunho',
      empresaId: c.empresaId,
      locale: 'pt-BR',
      timeoutMs: 90000,
      maxRetries: 0,
    });
  } catch {
    throw new RecepcaoError(502, 'Não foi possível gerar o rascunho agora. Tente de novo ou comece do caso em branco.');
  }
  let bruto: unknown;
  try {
    bruto = parseJsonIA(raw);
  } catch {
    bruto = null;
  }
  const partes = rascunhoIaSchema.safeParse(bruto);
  if (!partes.success)
    throw new RecepcaoError(502, 'O rascunho veio incompleto. Tente de novo com mais detalhes ou comece do caso em branco.');
  const p = partes.data;
  const comLimites = (x: z.infer<typeof pessoaSchema>) => ({ ...x, limites: LIMITES_PADRAO });
  const caso = montarCaso(c.dominio, {
    titulo: p.titulo,
    objetivo: p.objetivo,
    contexto: p.contexto,
    agora: p.agora || null,
    secoes: p.secoes,
    procedimentos: p.procedimentos,
    pessoa: comLimites(p.pessoa),
    variantes: [comLimites(p.variante)],
    criterios: p.criterios,
  });
  caso.statusEditorial = 'rascunho_ia';
  return cenarioSchema.parse(caso);
}
