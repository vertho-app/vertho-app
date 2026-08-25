/**
 * Coleta: os modelos de IA CONFIGURADOS ainda existem no provedor?
 *
 * Por que este check precisa existir (25/08/2026 — encontrado medindo):
 * a ACME Demo tinha `ia3_check` e `ia4_check` com override explícito para
 * `gpt-5.4`. O id era válido quando foi gravado e **morreu no provedor** meses
 * depois (403 com a chave do projeto; some da listagem `/v1/models`). Override
 * explícito por task vence o pin, de propósito — então os dois auditores Dual-IA
 * daquele tenant apontavam para um modelo inexistente, e nada acusava.
 *
 * 🔑 Nenhuma validação de ESCRITA pegaria isso. `salvarConfig` só vê o momento
 * em que o valor é gravado; o defeito nasceu do DRIFT DO PROVEDOR, depois. É por
 * isso que a verificação precisa ser recorrente e sair para a rede — a resposta
 * não existe em tabela nenhuma, mesma razão do R12/R13 (canal de entrada e
 * templates ligados).
 *
 * Custo: uma listagem `GET /models` por FAMÍLIA (~6 chamadas), não uma completion
 * por modelo. Zero token de saída. `Medido:` a listagem separa o caso real —
 * `gpt-5.4` não aparece, `gpt-5.4-2026-03-05` e `gpt-5.6-terra` aparecem.
 */
import { DEFAULT_TASK_MODELS, MODELOS_DISPONIVEIS, familiaDoModelo } from '@/lib/ai-tasks';
import { modeloTemRota, listarModelosDoProvedor, type ListagemProvedor } from '@/lib/ai-provedores';
import { MODELS } from '@/lib/ia-cost-catalog';

export interface ModeloObservado {
  modelo: string;
  /** Onde ele está configurado — vira a amostra acionável do achado. */
  origens: string[];
  familia: string | null;
  temRota: boolean;
  temPreco: boolean;
  /** true/false = perguntamos ao provedor. null = não deu para perguntar. */
  existeNoProvedor: boolean | null;
  /** Preenchido quando `existeNoProvedor` é null: por que ficamos cegos. */
  motivoCegueira?: string;
}

/**
 * Junta TODOS os modelos que o runtime pode acabar usando, com a origem de cada
 * um. `sysConfigs` vem do caller (o core já tem o supabase admin em mão) para
 * este módulo não abrir conexão própria.
 */
export function reunirModelosConfigurados(
  sysConfigs: Array<{ nome: string; sysConfig: any }>,
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  const add = (modelo: string | null | undefined, origem: string) => {
    if (!modelo) return;
    const atual = mapa.get(modelo) || [];
    if (!atual.includes(origem)) atual.push(origem);
    mapa.set(modelo, atual);
  };

  for (const [task, modelo] of Object.entries(DEFAULT_TASK_MODELS)) add(modelo, `default:${task}`);
  for (const { id } of MODELOS_DISPONIVEIS) add(id, 'dropdown');
  for (const { nome, sysConfig } of sysConfigs) {
    add(sysConfig?.ai?.modelo_padrao, `${nome}:modelo_padrao`);
    for (const [task, modelo] of Object.entries(sysConfig?.ai?.modelos || {})) {
      add(modelo as string, `${nome}:${task}`);
    }
  }
  return mapa;
}

/** Faz as perguntas de rede e devolve a observação por modelo. */
export async function inspecionarModelosConfigurados(
  sysConfigs: Array<{ nome: string; sysConfig: any }>,
): Promise<ModeloObservado[]> {
  const mapa = reunirModelosConfigurados(sysConfigs);

  const familias = new Map<string, string | null>();
  for (const modelo of mapa.keys()) {
    try { familias.set(modelo, familiaDoModelo(modelo)); } catch { familias.set(modelo, null); }
  }

  // Uma listagem por família, usando um modelo daquela família como amostra para
  // resolver o endpoint por prefixo. Famílias com bases diferentes por modelo não
  // existem hoje; se surgirem, a chave deste mapa vira a URL, não a família.
  const exemploPorFamilia = new Map<string, string>();
  for (const [modelo, f] of familias) if (f && !exemploPorFamilia.has(f)) exemploPorFamilia.set(f, modelo);

  const listagens = new Map<string, ListagemProvedor>();
  await Promise.all([...exemploPorFamilia.entries()].map(async ([f, exemplo]) => {
    listagens.set(f, await listarModelosDoProvedor(f, exemplo));
  }));

  return [...mapa.entries()].map(([modelo, origens]) => {
    const familia = familias.get(modelo) ?? null;
    const lista = familia ? listagens.get(familia) : undefined;
    const cego = !lista || 'erro' in lista;
    return {
      modelo,
      origens,
      familia,
      temRota: modeloTemRota(modelo),
      temPreco: Boolean((MODELS as Record<string, unknown>)[modelo]),
      existeNoProvedor: cego ? null : (lista as { ids: Set<string> }).ids.has(modelo),
      motivoCegueira: cego
        ? (lista && 'erro' in lista ? lista.erro : `família desconhecida para "${modelo}"`)
        : undefined,
    };
  });
}
