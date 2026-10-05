/**
 * Ranking de Adequação do pacote offline, montado SEM banco, rede ou IA.
 *
 * O PDF do ranking é uma view pura do snapshot que a sala online grava a cada reset
 * (`buildAcmeFitRankingArtifacts`: o motor de adequação sobre o gabarito do cargo e o
 * DISC do elenco, mais as narrativas determinísticas). Aqui o mesmo construtor roda
 * sobre um cliente em memória alimentado pelos fixtures e pelo roster, então o PDF do
 * pacote sai do MESMO motor e das MESMAS pessoas da sala, e não de um retrato antigo.
 *
 * O cliente em memória só sabe o que o construtor pergunta (`select`, `eq`, `not`, `in`,
 * `or`, `order`, `limit`, `maybeSingle`). Qualquer outra chamada lança: se o construtor
 * passar a perguntar outra coisa, a geração falha alto em vez de devolver um ranking vazio.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdequacaoCargo } from '@/lib/adequacao-cargo/aggregate';
import type { RankingPDFInput } from '@/lib/adequacao-cargo/ranking-pdf';
import { ACME_DEMO_FIT_RANKING_ROLES, buildAcmeFitRankingArtifacts } from '@/lib/demo/acme-fit-rankings';
import { ACME_DEMO_WITHOUT_PROFILE_KEYS } from '@/lib/demo/acme-rh-report-fixture';
import { comportamentosDoDisc } from '@/lib/demo/comportamentos-do-disc';
import { rosterDemo } from '@/lib/demo/rosters';
import { deriveProfile } from '@/lib/disc-mapeamento';
import acmeFixture from '../acme-demo-fixture.json';
import acmeExtras from '../acme-demo-extra-artifacts.json';
import escolasFixture from '../escolas-demo-fixture.json';
import type { OfflineTenant } from './environment';

type Linha = Record<string, any>;

/** Consulta encadeável que se resolve como o supabase-js: `{ data, error }`. */
class Consulta implements PromiseLike<{ data: any; error: null }> {
  private linhas: Linha[];
  constructor(linhas: Linha[]) { this.linhas = [...linhas]; }
  select(_colunas?: string) { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  not(coluna: string, operador: string, valor: unknown) {
    if (operador !== 'is' || valor !== null) throw new Error(`cliente em memória: not(${coluna}, ${operador}) não é suportado`);
    this.linhas = this.linhas.filter((l) => l[coluna] != null);
    return this;
  }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  // O filtro de contas internas (`excludeInternalEmails`) mantém as personas `.demo@vertho.ai`: todo o elenco passa.
  or(_filtro: string) { return this; }
  order(coluna: string) { this.linhas.sort((a, b) => String(a[coluna] ?? '').localeCompare(String(b[coluna] ?? ''), 'pt-BR')); return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  maybeSingle() { return Promise.resolve({ data: this.linhas[0] ?? null, error: null }); }
  then<R1 = { data: any; error: null }, R2 = never>(
    onfulfilled?: ((valor: { data: any; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.linhas, error: null }).then(onfulfilled, onrejected);
  }
}

function clienteEmMemoria(tabelas: Record<string, Linha[]>): SupabaseClient {
  return {
    from(tabela: string) {
      if (!(tabela in tabelas)) throw new Error(`cliente em memória: tabela "${tabela}" não é suportada`);
      return new Consulta(tabelas[tabela]);
    },
  } as unknown as SupabaseClient;
}

const ROSTER_DO_AMBIENTE = { 'acme-demo': 'comercial', 'escolas-acme': 'escolar' } as const;

/**
 * O construtor monta o caminho do snapshot no Storage e valida que o dono é um UUID. Aqui nada
 * é gravado, então qualquer UUID serve; um fixo mantém o resultado igual a cada execução.
 */
const EMPRESA_EM_MEMORIA = '00000000-0000-4000-8000-000000000000';

/** O gabarito e a marca de liderança de cada cargo, de onde o reset os lê. */
function cargosDoAmbiente(tenant: OfflineTenant, nomes: string[]) {
  const roster = rosterDemo(ROSTER_DO_AMBIENTE[tenant]);
  const doFixture = ((tenant === 'acme-demo' ? acmeFixture : escolasFixture).cargos || []) as Linha[];
  const extras = (tenant === 'acme-demo' ? (acmeExtras as Linha).gabaritos : {}) as Record<string, any>;
  return nomes.map((nome) => {
    const construido = roster.cargosConstruidos.find((c) => c.nome === nome);
    const noFixture = doFixture.find((c) => c.nome === nome);
    return {
      empresa_id: EMPRESA_EM_MEMORIA,
      nome,
      // Cargo construído no código leva o gabarito congelado dos extras; o do fixture, o próprio.
      gabarito: extras[nome] ?? noFixture?.gabarito ?? null,
      eh_lideranca: construido?.ehLideranca ?? noFixture?.eh_lideranca ?? false,
    };
  });
}

/** O elenco como `colaboradores`: DISC do roster, colunas comportamentais pela régua canônica. */
function colaboradoresDoAmbiente(tenant: OfflineTenant) {
  const roster = rosterDemo(ROSTER_DO_AMBIENTE[tenant]);
  const semPerfil = new Set<string>([
    ...(tenant === 'acme-demo' ? ACME_DEMO_WITHOUT_PROFILE_KEYS : []),
    ...(roster.panorama?.semPerfil ?? []),
  ]);
  return [...roster.personas, ...(roster.diretorio ?? [])].map((p: any) => ({
    id: p.key,
    empresa_id: EMPRESA_EM_MEMORIA,
    nome_completo: p.nome_completo,
    email: p.email,
    cargo: p.cargo,
    perfil_dominante: semPerfil.has(p.key) ? null : (p.perfil_dominante ?? deriveProfile({ D: p.d_natural, I: p.i_natural, S: p.s_natural, C: p.c_natural })),
    d_natural: p.d_natural, i_natural: p.i_natural, s_natural: p.s_natural, c_natural: p.c_natural,
    ...comportamentosDoDisc(p.d_natural, p.i_natural, p.s_natural, p.c_natural),
  }));
}

export type RankingDoPacote = { cargo: string; input: RankingPDFInput };

const BLOCOS = ['Competência', 'Liderança', 'DISC', 'Mapeamento'] as const;
const desvio = (valores: number[]) => {
  if (valores.length < 2) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  return Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length);
};
const blocosDe = (p: any): Record<string, number | null> => ({
  'Competência': p.competencia?.pct ?? null,
  'Liderança': p.lideranca?.excluido ? null : (p.lideranca?.pct ?? null),
  'DISC': p.discScore?.pct ?? null,
  'Mapeamento': p.mapeamento?.pct ?? null,
});

/**
 * Do snapshot à entrada do PDF: o MESMO preparo de `_exportarPDF` (`actions/ranking-adequacao.ts`).
 * Fica por ordem de aderência, o bloco que separa o grupo entra como desempate e quem não passa
 * por um requisito essencial vai para o anexo, sem aderência.
 */
export function entradaDoPdfDeRanking(
  snapshot: { data: AdequacaoCargo; empresaNome: string; dataISO: string; narrativas: Record<string, string> },
  cargo: string,
): RankingPDFInput {
  const data = snapshot.data;
  const pesos = data.perfilIdeal?.pesos || [];
  const elegiveis = data.pessoas.filter((p) => p.status !== 'bloqueado');
  const anexo = data.pessoas.filter((p) => p.status === 'bloqueado');
  const eixoBloco = [...pesos].sort((a, b) => b.pct - a.pct)[0]?.bloco || 'Competência';
  const eixoPeso = pesos.find((p) => p.bloco === eixoBloco)?.pct ?? null;
  const variacao = BLOCOS.map((bloco) => {
    const valores = elegiveis.map((p) => blocosDe(p)[bloco]).filter((v): v is number => v != null);
    return { bloco: bloco as string, sd: valores.length ? desvio(valores) : 0 };
  });
  const sdEixo = variacao.find((v) => v.bloco === eixoBloco)?.sd ?? 0;
  const maisVaria = [...variacao].filter((v) => v.sd > 0).sort((a, b) => b.sd - a.sd)[0];
  const divergencia = sdEixo < 4 && maisVaria && maisVaria.bloco !== eixoBloco && maisVaria.sd >= 4
    ? { eixo: eixoBloco, real: maisVaria.bloco, sdEixo: Math.round(sdEixo * 10) / 10 }
    : null;
  const sep = divergencia?.real || eixoBloco;
  const eixoMorto = divergencia ? eixoBloco : null;
  const comFit = elegiveis.map((p) => {
    const b = blocosDe(p);
    return { ...p, __sepFit: b[sep], __mortoFit: eixoMorto ? b[eixoMorto] : null };
  });
  comFit.sort((a: any, b: any) => (b.beta?.pct ?? -1) - (a.beta?.pct ?? -1) || (b.__sepFit ?? -1) - (a.__sepFit ?? -1));
  return {
    empresaNome: snapshot.empresaNome,
    cargo,
    dataISO: snapshot.dataISO,
    perfilIdeal: data.perfilIdeal,
    eixo: { label: eixoBloco, peso: eixoPeso },
    sep,
    divergencia,
    elegiveis: comFit,
    anexo,
    narrativas: snapshot.narrativas || {},
  };
}

/**
 * O motor de adequação escreve o rótulo de cada fator DISC com travessão ("D — Dominância",
 * `lib/scoring/role-spec.ts`), e o rótulo viaja por todo o snapshot (traços, distâncias até a
 * meta, narrativa). A regra de voz é "sem travessão": o PDF do pacote troca o travessão por
 * dois-pontos, no snapshot inteiro de uma vez, então o rótulo continua igual em toda parte e
 * o casamento entre traço e distância (que o PDF faz por texto) não se perde. O rótulo do
 * motor não muda: ele está gravado nos snapshots da sala online.
 */
export function semTravessaoDoMotor<T>(valor: T): T {
  if (typeof valor === 'string') return valor.replace(/ — /g, ': ') as unknown as T;
  if (Array.isArray(valor)) return valor.map(semTravessaoDoMotor) as unknown as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([chave, v]) => [chave, semTravessaoDoMotor(v)])) as T;
  }
  return valor;
}

/**
 * Um ranking por cargo, na ordem em que o pacote os numera. `dataISO` é a data que a tela do
 * pacote mostra (a do retrato salvo), para o documento e a tela não terem dias diferentes.
 */
export async function rankingsDoPacote(
  tenant: OfflineTenant,
  empresaNome: string,
  cargos: Array<{ cargo: string; dataISO: string }>,
): Promise<RankingDoPacote[]> {
  const sb = clienteEmMemoria({
    colaboradores: colaboradoresDoAmbiente(tenant),
    cargos_empresa: cargosDoAmbiente(tenant, [...new Set(colaboradoresDoAmbiente(tenant).map((c) => c.cargo))]),
  });
  const saida: RankingDoPacote[] = [];
  for (const { cargo, dataISO } of cargos) {
    // A ACME declara quantas pessoas cada cargo tem (o fixture é fixo: divergir é defeito);
    // o outro ambiente muda com o roster e não crava contagem.
    const declarado = tenant === 'acme-demo' ? ACME_DEMO_FIT_RANKING_ROLES.find((r) => r.cargo === cargo) : undefined;
    const [artefato] = await buildAcmeFitRankingArtifacts(
      sb, EMPRESA_EM_MEMORIA, empresaNome, Date.parse(dataISO), [declarado ? { ...declarado } : { cargo }],
    );
    saida.push({ cargo, input: semTravessaoDoMotor(entradaDoPdfDeRanking(artefato.snapshot, cargo)) });
  }
  return saida;
}
