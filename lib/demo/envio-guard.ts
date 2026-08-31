// Gate de envio de tenant-demo — bloqueia disparo real (WhatsApp/e-mail) em
// ambientes de demonstração/treinamento.
//
// Fonte de verdade: coluna empresas.is_demo (mig 160), NÃO os flags cosméticos
// do sys_config. Todo ponto de disparo em lote (whatsapp-lote, fase2 e-mails,
// pulso, relatórios) e o caminho de magic link/signup consultam este guard e
// param ANTES de mandar qualquer mensagem quando o tenant é demo.
// Exceção: `sys_config.demo_acesso_allowlist` libera o link de ACESSO real
// para destinatários específicos (degustação self-service) — ver
// `destinatarioLiberadoEmDemo`. Disparo em lote não tem exceção.
//
// Fail-safe: em erro de leitura, NÃO bloqueia (não queremos derrubar envio real
// por um blip); a proteção de última instância continua sendo as personas
// @vertho.ai sem telefone. Observável: loga toda supressão.
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

// Cache curto por processo — dispatch em lote chama uma vez por ação, mas o
// login/signup chama por usuário; evita repetir a query no mesmo burst.
const CACHE_TTL_MS = 60_000;
type DemoInfo = { isDemo: boolean; allowlist: string[]; at: number };
const cache = new Map<string, DemoInfo>();

async function demoInfo(empresaId: string): Promise<DemoInfo> {
  const now = Date.now();
  const hit = cache.get(empresaId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit;
  try {
    const sb = createSupabaseAdmin();
    const { data, error } = await sb.from('empresas').select('is_demo, sys_config').eq('id', empresaId).maybeSingle();
    // 🔴 O supabase-js RETORNA `{ error }` — não lança. Sem esta checagem a falha
    // de leitura não caía no `catch` abaixo: passava reto, `data` vinha `null`,
    // `isDemo` virava `false` e o tenant de DEMO mandava comunicação real. Ou
    // seja, a política de fail-open era aplicada no caso mais provável (erro de
    // query) sem sequer o `console.warn` que o catch promete.
    //
    // A política continua a MESMA — não bloquear, porque travar envio de todo
    // mundo por uma leitura instável é pior. O que muda é que ela deixa rastro.
    //
    // ⚠️ E não entra no cache: guardar um fail-open estenderia por 60s inteiros
    // a janela em que um tenant de demo é tratado como real.
    if (error) {
      console.warn('[envio-guard] falha ao ler is_demo, NÃO bloqueando:', error.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.DEMO_GUARD_CEGO,
        chave: empresaId,
        empresaId,
        severidade: 'critico',
        detalhe: { erro: error.message },
      }, sb);
      return { isDemo: false, allowlist: [], at: now };
    }
    const raw = (data as any)?.sys_config?.demo_acesso_allowlist;
    const info: DemoInfo = {
      isDemo: !!(data as any)?.is_demo,
      allowlist: Array.isArray(raw)
        ? raw.map((e: any) => String(e).trim().toLowerCase()).filter(Boolean)
        : [],
      at: now,
    };
    cache.set(empresaId, info);
    return info;
  } catch (e: any) {
    console.warn('[envio-guard] falha ao ler is_demo, NÃO bloqueando:', e?.message);
    return { isDemo: false, allowlist: [], at: now };
  }
}

/** true se o tenant é de demonstração (envios reais bloqueados). */
export async function isTenantDemo(empresaId: string | null | undefined): Promise<boolean> {
  if (!empresaId) return false;
  return (await demoInfo(empresaId)).isDemo;
}

/**
 * Exceção cirúrgica ao bloqueio de demo: e-mails listados em
 * `empresas.sys_config.demo_acesso_allowlist` recebem link de acesso REAL
 * mesmo com `is_demo=true` — para o prospect experimentar o login
 * self-service (magic link por e-mail/WhatsApp) num tenant de demonstração.
 * Escopo: SÓ o access-link (login/signup). Os disparos em lote seguem
 * bloqueados pelo gate, que não conhece destinatário.
 */
export async function destinatarioLiberadoEmDemo(empresaId: string | null | undefined, email: string | null | undefined): Promise<boolean> {
  if (!empresaId || !email) return false;
  return (await demoInfo(empresaId)).allowlist.includes(email.trim().toLowerCase());
}

export type EnvioGate = { blocked: boolean; motivo?: string };

/**
 * Resultado de gate para o topo dos dispatchers. Quando `blocked`, o chamador
 * deve retornar SEM enviar nada (com uma mensagem clara ao operador).
 */
export async function gateEnvioDemo(empresaId: string | null | undefined): Promise<EnvioGate> {
  if (await isTenantDemo(empresaId)) {
    console.log(`[envio-guard] disparo suprimido — tenant demo ${empresaId}`);
    return { blocked: true, motivo: 'Envios reais estão desligados no ambiente de demonstração.' };
  }
  return { blocked: false };
}

/** Limpa o cache (usar após reset/mudança de flag do tenant). */
export function resetEnvioGuardCache() {
  cache.clear();
}
