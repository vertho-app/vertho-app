import { existsSync, readFileSync } from 'node:fs';

/**
 * Configuração de TLS para conectar ao Postgres do Supabase pelos scripts.
 *
 * O problema real: `ssl: { rejectUnauthorized: false }` — o padrão herdado neste
 * repo — aceita QUALQUER certificado, e esses scripts falam com o pooler de
 * PRODUÇÃO carregando credencial. Um intermediário no caminho leria a senha.
 *
 * Por que não é só trocar por `ssl: true`: medido em 11/08/2026, o pooler
 * responde com `SELF_SIGNED_CERT_IN_CHAIN` — a CA do Supabase não está no trust
 * store do sistema. A doc oficial confirma: para `verify-full` é preciso baixar
 * o `prod-ca-2021.crt` no dashboard (Database Settings → SSL Configuration).
 *
 * Então: se o CA estiver disponível, VERIFICA de verdade; se não, conecta e
 * AVISA alto, dizendo o que fazer. O aviso é o ponto — silêncio aqui é como
 * "aceita qualquer certificado" vira o normal da casa.
 *
 * Para ligar a verificação (uma vez):
 *   1. Dashboard → Database Settings → SSL Configuration → Download certificate
 *   2. salve como `config/supabase-ca.crt` (é público, pode versionar)
 *      ou aponte `SUPABASE_CA_CERT` para o arquivo.
 */
let jaAvisou = false;

export function sslSupabase({ silencioso = false } = {}) {
  const caminho = process.env.SUPABASE_CA_CERT || 'config/supabase-ca.crt';
  if (existsSync(caminho)) {
    return { ca: readFileSync(caminho, 'utf8'), rejectUnauthorized: true };
  }
  // Uma vez por processo: um script com retry repetiria o aviso a cada
  // tentativa, e aviso repetido é a forma mais rápida de virar ruído ignorado.
  if (!silencioso && !jaAvisou) {
    jaAvisou = true;
    console.warn(
      `⚠️  TLS sem verificação de certificado (CA não encontrada em "${caminho}").\n` +
      '   A conexão é criptografada, mas um intermediário poderia se passar pelo servidor.\n' +
      '   Para verificar: baixe o certificado em Database Settings → SSL Configuration\n' +
      '   e salve como config/supabase-ca.crt (ou aponte SUPABASE_CA_CERT).',
    );
  }
  return { rejectUnauthorized: false };
}
