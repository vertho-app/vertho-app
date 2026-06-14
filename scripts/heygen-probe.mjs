// Valida a HEYGEN_API_KEY: cota, avatar usado (Abigail) e vozes PT (informativo).
// Rodar: node --env-file=.env.local scripts/heygen-probe.mjs
const key = process.env.HEYGEN_API_KEY;
if (!key) { console.log('HEYGEN_API_KEY ausente no env'); process.exit(1); }
const H = { 'X-Api-Key': key, Accept: 'application/json' };
const AVATAR = 'Abigail_expressive_2024112501';

async function get(url) {
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}

// 1) cota
for (const u of ['https://api.heygen.com/v2/user/remaining_quota', 'https://api.heygen.com/v1/user/remaining_quota']) {
  const { status, j } = await get(u);
  console.log('quota', u.includes('v2') ? 'v2' : 'v1', '→', status, JSON.stringify(j).slice(0, 160));
  if (status === 200) break;
}

// 2) avatares — confirma o Abigail
const av = await get('https://api.heygen.com/v2/avatars');
console.log('\navatars →', av.status);
if (av.status === 200) {
  const list = av.j?.data?.avatars || [];
  console.log('  total avatars:', list.length);
  const found = list.find((a) => a.avatar_id === AVATAR);
  console.log('  Abigail (' + AVATAR + '):', found ? `OK — ${found.avatar_name} (${found.gender})` : 'NÃO encontrado na conta');
} else {
  console.log('  ', JSON.stringify(av.j).slice(0, 200));
}

// 3) vozes PT (informativo — não usamos voz HeyGen, mas útil ter)
const vo = await get('https://api.heygen.com/v2/voices');
if (vo.status === 200) {
  const pt = (vo.j?.data?.voices || []).filter((v) => /portug/i.test(v.language || ''));
  console.log('\nvozes PT:', pt.length);
  pt.slice(0, 8).forEach((v) => console.log('  ', v.voice_id, '|', v.name, '|', v.gender, '|', v.language));
} else {
  console.log('\nvoices →', vo.status, JSON.stringify(vo.j).slice(0, 160));
}
