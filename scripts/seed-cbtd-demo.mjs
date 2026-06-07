/**
 * Seed da empresa-demo CBTD (slug `cbtd`, subdomínio cbtd.vertho.ai).
 *
 * Fase 1 — fundação: cria/atualiza o tenant + cargos de T&D + open signup.
 * Idempotente: roda quantas vezes quiser (UPSERT por slug / ON CONFLICT).
 * NÃO cria colaboradores/DISC/trilhas — isso é Fase 2/3.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-cbtd-demo.mjs
 *
 * Requer DATABASE_URL (Session pooler) no .env.local.
 */
import pg from 'pg';

const SLUG = 'cbtd';
const NOME = 'Vertho — Experiência CBTD';

// Cargos de T&D pro dropdown do open signup (cargos_empresa).
const CARGOS = [
  { nome: 'Gerente de T&D',            area: 'Treinamento e Desenvolvimento', desc: 'Lidera a estratégia de desenvolvimento de pessoas e a trilha de aprendizagem da organização.', lideranca: true },
  { nome: 'Coordenador(a) de Treinamento', area: 'Treinamento e Desenvolvimento', desc: 'Coordena programas de capacitação, conteúdos e a execução das jornadas de desenvolvimento.', lideranca: true },
  { nome: 'Analista de RH',            area: 'Recursos Humanos',              desc: 'Atua em desenvolvimento, avaliação e acompanhamento de competências dos colaboradores.', lideranca: false },
  { nome: 'Business Partner de RH',    area: 'Recursos Humanos',              desc: 'Parceiro estratégico das áreas de negócio em gente, cultura e desenvolvimento de lideranças.', lideranca: true },
];

// sys_config: open signup ON; cadência automática OFF (sem envios acidentais
// durante setup); programa_modo omitido → herda o default global (Regular DUO).
const SYS_CONFIG = {
  allow_open_signup: true,
  ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: {} },
  cadencia: { email_ativo: false, whatsapp_ativo: false },
  envios: {},
};

// ui_config: branding Vertho (navy + cyan), legenda de login do evento.
const UI_CONFIG = {
  primary_color: '#0D9488',
  primary_color_end: '#0F766E',
  accent_color: '#00B4D8',
  bg_gradient_start: '#091D35',
  bg_gradient_end: '#0F2A4A',
  font_color: '#FFFFFF',
  font_color_secondary: '#FFFFFF99',
  login_subtitle: 'Experimente a jornada de desenvolvimento da Vertho — CBTD 2026',
  labels: {},
  hidden_elements: [],
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FALTA DATABASE_URL no .env.local'); process.exit(1); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // 1) UPSERT empresa por slug
    const up = await client.query(
      `INSERT INTO empresas (nome, slug, segmento, sys_config, ui_config, default_locale)
       VALUES ($1, $2, 'corporativo', $3::jsonb, $4::jsonb, 'pt-BR')
       ON CONFLICT (slug) DO UPDATE
         SET nome = EXCLUDED.nome,
             segmento = EXCLUDED.segmento,
             sys_config = empresas.sys_config || EXCLUDED.sys_config,
             ui_config = empresas.ui_config || EXCLUDED.ui_config,
             updated_at = now()
       RETURNING id, slug, nome, (sys_config->>'allow_open_signup') AS open_signup`,
      [NOME, SLUG, JSON.stringify(SYS_CONFIG), JSON.stringify(UI_CONFIG)],
    );
    const empresa = up.rows[0];
    console.log(`✅ empresa: ${empresa.nome} (slug=${empresa.slug}, id=${empresa.id}, open_signup=${empresa.open_signup})`);

    // 2) Cargos (idempotente por UNIQUE(empresa_id, nome))
    for (const c of CARGOS) {
      await client.query(
        `INSERT INTO cargos_empresa (empresa_id, nome, area_depto, descricao, eh_lideranca)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (empresa_id, nome) DO UPDATE
           SET area_depto = EXCLUDED.area_depto, descricao = EXCLUDED.descricao,
               eh_lideranca = EXCLUDED.eh_lideranca, updated_at = now()`,
        [empresa.id, c.nome, c.area, c.desc, c.lideranca],
      );
    }
    const cnt = await client.query('SELECT count(*)::int AS n FROM cargos_empresa WHERE empresa_id = $1', [empresa.id]);
    console.log(`✅ cargos: ${cnt.rows[0].n} no tenant`);
    console.log('\nFase 1 concluída. Próximo: adicionar cbtd.vertho.ai no Vercel + Fase 2 (personas).');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
