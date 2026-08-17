/**
 * Qual template da Meta está LIGADO em cada papel da cadência — e o que a Meta
 * pensa dele.
 *
 * 🔴 POR QUE ISTO EXISTE (15/08/2026)
 * ──────────────────────────────────
 * O nome do template vem de variável de ambiente (`WHATSAPP_TEMPLATE_*`), e na
 * Vercel essas variáveis estão marcadas como **Sensitive**: não dá para lê-las
 * de volta, nem pelo CLI. Some-se a isso que `templateAtivo()` não tinha nenhum
 * outro consumidor — nenhuma tela, nenhum check — e o resultado é uma
 * configuração que decide custo e entrega **sem nenhum lugar onde olhar**.
 *
 * Foi assim que a pílula semanal ficou ligada num template que a Meta havia
 * reclassificado para MARKETING: aprovado, funcionando, entregando — e custando
 * ~6× (R$ 0,40-0,55 contra R$ 0,06-0,09). Nada quebra; a fatura muda.
 *
 * Os dois modos de falha que este módulo torna visíveis:
 *
 *   1. **Nome que a Meta não reconhece** (typo, template apagado, `\n` colado
 *      pelo shell no `vercel env add`) → a Meta responde **132001** e a mensagem
 *      simplesmente não sai;
 *   2. **Categoria MARKETING** → sai, entrega, e custa 6× em silêncio.
 *
 * ⚠️ Este módulo só PERGUNTA. Quem decide o que é achado é
 * `checarTemplatesLigados` em `lib/pipeline-health/regras.ts` — mesma separação
 * do R12, que é o que permite testar a régua por mutação sem rede.
 */
import { templateAtivo, type PapelCadencia } from '@/lib/notifications/pilula-template';

export const PAPEIS: PapelCadencia[] = [
  'pilula', 'evidencia', 'desafio', 'retomada', 'perfil', 'acesso',
  // Sem gatilho automático (o disparo é deliberado, por turma), mas entra aqui
  // pelo mesmo motivo dos outros: se a env apontar para um nome que a Meta não
  // conhece, isso só apareceria como 132001 no dia da abertura da turma — que é
  // o pior dia possível para descobrir.
  'boas_vindas',
];

export interface TemplateLigado {
  papel: PapelCadencia;
  /** Nome configurado no ambiente. `null` = papel desligado (estado legítimo). */
  nome: string | null;
  /** `null` quando não foi possível perguntar à Meta, ou o nome não existe lá. */
  status: string | null;
  categoria: string | null;
  /** Preenchido quando a consulta à Meta falhou — cegueira é um estado. */
  motivo: string | null;
}

const GRAPH = 'https://graph.facebook.com/v22.0';

/**
 * Lê o ambiente, pergunta à Meta uma vez só e cruza os dois.
 *
 * Nunca lança: um check que derruba o health por indisponibilidade de rede
 * troca um aviso por um apagão.
 */
export async function inspecionarTemplatesLigados(): Promise<TemplateLigado[]> {
  const base: TemplateLigado[] = PAPEIS.map((papel) => ({
    papel, nome: templateAtivo(papel), status: null, categoria: null, motivo: null,
  }));

  // Nenhum papel ligado: não há o que perguntar, e isso não é falha.
  if (!base.some((t) => t.nome)) return base;

  const waba = process.env.WABA_ID || '';
  const token = process.env.META_WHATSAPPBUSINESS_API || '';
  if (!waba || !token) {
    return base.map((t) => (t.nome ? { ...t, motivo: 'sem WABA_ID/token para consultar a Meta' } : t));
  }

  let porNome: Record<string, { status: string; category: string }> = {};
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(
      `${GRAPH}/${waba}/message_templates?limit=200&fields=name,status,category&access_token=${encodeURIComponent(token)}`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    const j: any = await r.json();
    if (j?.error) throw new Error(j.error.message || 'erro da Graph API');
    for (const t of j?.data || []) {
      if (t?.name) porNome[t.name] = { status: String(t.status || ''), category: String(t.category || '') };
    }
  } catch (e: any) {
    const motivo = e?.name === 'AbortError' ? 'timeout ao consultar a Meta' : (e?.message || 'falha ao consultar a Meta');
    return base.map((t) => (t.nome ? { ...t, motivo } : t));
  }

  const out = base.map((t) => {
    if (!t.nome) return t;
    const m = porNome[t.nome];
    // Nome configurado que a Meta não conhece: NÃO é cegueira (a consulta
    // funcionou), é um envio que vai falhar com 132001.
    if (!m) return { ...t, status: 'INEXISTENTE', categoria: null, motivo: null };
    return { ...t, status: m.status, categoria: m.category, motivo: null };
  });

  // 🔑 IMPRIMIR O OBSERVADO, NÃO O VEREDITO.
  //
  // O health só persiste ACHADOS, e achado é o que deu errado. Quando está tudo
  // certo, o resultado é silêncio — e silêncio é indistinguível de "papel
  // desligado, pulado sem alarme". Foi essa ambiguidade que, em 16/08, deixou a
  // troca da pílula para UTILITY como INFERÊNCIA por ausência em vez de leitura:
  // as variáveis são *Sensitive* na Vercel e não há nenhum outro lugar onde o
  // valor aplicado apareça.
  //
  // Esta linha é esse lugar. Papel DESLIGADO aparece como `(desligado)`, e é
  // exatamente o caso que o silêncio escondia.
  console.log('[templates-ligados] ' + out
    .map((t) => `${t.papel}=${t.nome ?? '(desligado)'}${t.nome ? `[${t.status ?? t.motivo ?? '?'}/${t.categoria ?? '-'}]` : ''}`)
    .join(' '));

  return out;
}
