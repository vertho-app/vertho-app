/**
 * Seed das PERSONAS do showcase CBTD (Fase 2) — tenant `cbtd` / Grupo Meridiano.
 *
 * Cria 4 colaboradores fictícios (rede varejista) com DISC completo e coerente,
 * cobrindo 4 arquétipos (DI, DC, IS, SC). Marca como mapeados (mapeamento_em).
 * Relatório comportamental e insights são gerados SOB DEMANDA ao abrir o perfil
 * (cache em report_texts/insights_executivos) — não pré-seedados aqui.
 *
 * NÃO cria usuários de login (auth) nem trilhas — isso é fase posterior.
 * Idempotente por UNIQUE(empresa_id, email).
 *
 * Uso: node --env-file=.env.local scripts/seed-cbtd-personas.mjs
 */
import pg from 'pg';

const SLUG = 'cbtd';

// Competências derivadas do DISC (mantém o perfil coerente entre telas).
const r = (n) => Math.round(n);
function compFromDISC(d, i, s, c) {
  return {
    comp_ousadia: d, comp_comando: d, comp_objetividade: r((d + c) / 2), comp_assertividade: r((d + i) / 2),
    comp_persuasao: i, comp_extroversao: i, comp_entusiasmo: i, comp_sociabilidade: r((i + s) / 2),
    comp_empatia: s, comp_paciencia: s, comp_persistencia: r((s + c) / 2),
    comp_planejamento: c, comp_organizacao: c, comp_detalhismo: c, comp_prudencia: r((c + s) / 2), comp_concentracao: r((c + s) / 2),
  };
}
// d,i,s,c naturais por persona.
const PERSONAS = [
  {
    email: 'mariana.torres@grupomeridiano.com.br', nome: 'Mariana Torres',
    cargo: 'Gerente de Loja — Flagship Morumbi', area: 'Varejo / Operações de Loja',
    gestor: 'Patrícia Lemos', perfil: 'DI', d: 82, i: 74, s: 38, c: 45, da: 78, ia: 70, sa: 44, ca: 48,
    val: { val_teorico: 45, val_economico: 78, val_estetico: 60, val_social: 66, val_politico: 80, val_religioso: 30 },
    lid: { lid_executivo: 82, lid_motivador: 74, lid_metodico: 42, lid_sistematico: 45 },
    pref: { pref_video_curto: 9, pref_video_longo: 4, pref_texto: 5, pref_audio: 7, pref_infografico: 8, pref_exercicio: 6, pref_mentor: 8, pref_estudo_caso: 7 },
    tp: { tp_sensor_intuitivo: 'Intuitivo', tp_racional_emocional: 'Racional', tp_introvertido_extrovertido: 'Extrovertido', tipo_psicologico: 'ENTJ' },
  },
  {
    email: 'rafael.nunes@grupomeridiano.com.br', nome: 'Rafael Nunes',
    cargo: 'Supervisor Regional de Lojas', area: 'Varejo / Supervisão Regional',
    gestor: 'Patrícia Lemos', perfil: 'DC', d: 78, i: 40, s: 42, c: 80, da: 74, ia: 44, sa: 46, ca: 76,
    val: { val_teorico: 72, val_economico: 70, val_estetico: 40, val_social: 48, val_politico: 66, val_religioso: 35 },
    lid: { lid_executivo: 78, lid_motivador: 44, lid_metodico: 76, lid_sistematico: 80 },
    pref: { pref_video_curto: 6, pref_video_longo: 6, pref_texto: 8, pref_audio: 4, pref_infografico: 7, pref_exercicio: 8, pref_mentor: 6, pref_estudo_caso: 9 },
    tp: { tp_sensor_intuitivo: 'Sensor', tp_racional_emocional: 'Racional', tp_introvertido_extrovertido: 'Introvertido', tipo_psicologico: 'ISTJ' },
  },
  {
    email: 'camila.souza@grupomeridiano.com.br', nome: 'Camila Souza',
    cargo: 'Coordenadora de Experiência do Cliente (CX)', area: 'Atendimento / CX',
    gestor: 'André Bittencourt', perfil: 'IS', d: 38, i: 80, s: 76, c: 48, da: 42, ia: 76, sa: 72, ca: 50,
    val: { val_teorico: 44, val_economico: 40, val_estetico: 70, val_social: 88, val_politico: 46, val_religioso: 55 },
    lid: { lid_executivo: 48, lid_motivador: 80, lid_metodico: 58, lid_sistematico: 52 },
    pref: { pref_video_curto: 8, pref_video_longo: 5, pref_texto: 6, pref_audio: 8, pref_infografico: 7, pref_exercicio: 5, pref_mentor: 9, pref_estudo_caso: 6 },
    tp: { tp_sensor_intuitivo: 'Sensor', tp_racional_emocional: 'Emocional', tp_introvertido_extrovertido: 'Extrovertido', tipo_psicologico: 'ESFJ' },
  },
  {
    email: 'diego.almeida@grupomeridiano.com.br', nome: 'Diego Almeida',
    cargo: 'Analista de Planejamento e Operações', area: 'Planejamento / Supply',
    gestor: 'André Bittencourt', perfil: 'SC', d: 36, i: 42, s: 78, c: 82, da: 40, ia: 46, sa: 74, ca: 78,
    val: { val_teorico: 80, val_economico: 62, val_estetico: 45, val_social: 58, val_politico: 38, val_religioso: 48 },
    lid: { lid_executivo: 40, lid_motivador: 46, lid_metodico: 82, lid_sistematico: 80 },
    pref: { pref_video_curto: 5, pref_video_longo: 7, pref_texto: 9, pref_audio: 4, pref_infografico: 8, pref_exercicio: 9, pref_mentor: 5, pref_estudo_caso: 8 },
    tp: { tp_sensor_intuitivo: 'Sensor', tp_racional_emocional: 'Racional', tp_introvertido_extrovertido: 'Introvertido', tipo_psicologico: 'ISTP' },
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FALTA DATABASE_URL'); process.exit(1); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const emp = await client.query('SELECT id FROM empresas WHERE slug = $1', [SLUG]);
    if (!emp.rows[0]) { console.error(`tenant ${SLUG} não existe — rode seed-cbtd-demo.mjs antes`); process.exit(1); }
    const empresaId = emp.rows[0].id;

    for (const p of PERSONAS) {
      const comp = compFromDISC(p.d, p.i, p.s, p.c);
      const cols = {
        empresa_id: empresaId, email: p.email, nome_completo: p.nome, cargo: p.cargo, area_depto: p.area,
        role: 'colaborador', locale: 'pt-BR', gestor_nome: p.gestor, mapeamento_em: new Date().toISOString(),
        perfil_dominante: p.perfil,
        d_natural: p.d, i_natural: p.i, s_natural: p.s, c_natural: p.c,
        ...comp, ...p.val, ...p.lid, ...p.pref, ...p.tp,
      };
      const keys = Object.keys(cols);
      const vals = Object.values(cols);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const updates = keys.filter((k) => k !== 'empresa_id' && k !== 'email').map((k) => `"${k}" = EXCLUDED."${k}"`).join(', ');
      await client.query(
        `INSERT INTO colaboradores (${keys.map((k) => `"${k}"`).join(', ')})
         VALUES (${placeholders})
         ON CONFLICT (empresa_id, email) DO UPDATE SET ${updates}, updated_at = now()`,
        vals,
      );
      console.log(`✅ ${p.nome} — ${p.perfil} (${p.cargo})`);
    }
    const n = await client.query('SELECT count(*)::int AS n FROM colaboradores WHERE empresa_id = $1', [empresaId]);
    console.log(`\nFase 2: ${n.rows[0].n} personas no tenant. Relatório/insights geram ao abrir o perfil.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
