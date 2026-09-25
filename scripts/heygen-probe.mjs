// Valida a HEYGEN_API_KEY na API v3: saldo da carteira e o look da foto usada no vídeo.
// Não gera nada (grátis). Rodar: node --env-file=.env.local scripts/heygen-probe.mjs
// Para medir o CUSTO de um motor, leia o saldo antes e depois de UM clipe
// (método em docs/GERADOR-VIDEO-MODULO.md, "Integração HeyGen v3").
const key = process.env.HEYGEN_API_KEY;
if (!key) { console.log('HEYGEN_API_KEY ausente no env'); process.exit(1); }
const H = { 'X-Api-Key': key, Accept: 'application/json' };
const FOTO = process.env.HEYGEN_TALKING_PHOTO_ID || 'd160ea51f4124514b94aa1cf8e56eb42';

async function get(url) {
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}

// 1) saldo (a v3 cobra em US$; é o mesmo saldo que a v2 mostrava em créditos)
const me = await get('https://api.heygen.com/v3/users/me');
const w = me.j?.data?.wallet;
console.log('carteira →', me.status, w ? `US$ ${w.remaining_balance} (recarga automática: ${w.auto_reload?.enabled ? `US$ ${w.auto_reload.amount_usd} abaixo de US$ ${w.auto_reload.threshold_usd}` : 'desligada'})` : JSON.stringify(me.j).slice(0, 200));

// 2) o look da foto usada no vídeo
const look = await get(`https://api.heygen.com/v3/avatars/looks/${FOTO}`);
console.log(`\nlook ${FOTO} →`, look.status, look.status === 200
  ? `${look.j?.data?.avatar_type} · ${look.j?.data?.image_width}x${look.j?.data?.image_height} · ${look.j?.data?.preferred_orientation}`
  : JSON.stringify(look.j).slice(0, 200));
console.log('motor configurado:', process.env.HEYGEN_ENGINE || 'avatar_iii (default do código)');
