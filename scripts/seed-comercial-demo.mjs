// Popula as telas comerciais (Carteira, Propostas, Comissões) com dados de
// DEMONSTRAÇÃO, para ver como fica na vida real. Rodrigo vira RC (hero, dados
// ricos) + 2 RCs demo dão volume nas visões de canal do admin.
//
// Idempotente: limpa os dados dos 3 RCs demo e reinsere. `--clean` só remove.
// Rodar: node scripts/seed-comercial-demo.mjs  |  node scripts/seed-comercial-demo.mjs --clean
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = (k) => ENV.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const CLEAN_ONLY = process.argv.includes('--clean');
const URL_ = env('NEXT_PUBLIC_SUPABASE_URL'); const SR = env('SUPABASE_SERVICE_ROLE_KEY');
const hdrs = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };

const round2 = (n) => Math.round(n * 100) / 100;
const ymd = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d; };
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const firstOfMonthPlus = (i) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)); };

const REPS = [
  { email: 'rodrigo@vertho.ai', name: 'Rodrigo Naves', region: 'SP', hero: true },
  { email: 'demo-rc-mariana@vertho.ai', name: 'Mariana Costa', region: 'SP' },
  { email: 'demo-rc-rafael@vertho.ai', name: 'Rafael Lima', region: 'RJ' },
];

// Dataset por RC. Cada conta pode ter proposta (status) e virar cliente da carteira.
const DATA = {
  'rodrigo@vertho.ai': {
    accounts: [
      // ── CLIENTES ATIVOS (Carteira) ──────────────────────────────────────
      { legal: 'Colégio Nova Geração LTDA', trade: 'Colégio Nova Geração', seg: 'escola', city: 'Campinas', uf: 'SP', emp: 45, units: 1,
        status: 'active_client', startM: 8, renewalD: 28, churn: 'medio', expansion: true, contact: ['Fernanda Alves', 'Diretora Pedagógica'],
        followups: [['risco', 'Coordenação sinalizou sobrecarga; monitorar engajamento dos professores.'], ['followup', 'Reunião de acompanhamento do 2º trimestre agendada.']],
        opp: { name: 'Programa completo — Colégio Nova Geração', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 45600 },
        proposal: { status: 'accepted', package: 'completo', months: 12, monthly: 3800, comm: 'paid', doc: true } },
      { legal: 'Rede Aprender Mais S/A', trade: 'Rede Aprender+', seg: 'rede_ensino', city: 'São Paulo', uf: 'SP', emp: 320, units: 12,
        status: 'active_client', startM: 3, renewalD: 250, churn: 'baixo', expansion: true, contact: ['Carlos Menezes', 'Diretor de Ensino'],
        followups: [['expansao', 'Interesse em estender o programa para coordenadores das 12 unidades.']],
        opp: { name: 'Programa completo — Rede Aprender+', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 115200 },
        proposal: { status: 'accepted', package: 'completo', months: 24, monthly: 4800, comm: 'accrued', doc: true } },
      { legal: 'Instituto Horizonte de Educação', trade: 'Instituto Horizonte', seg: 'rede_ensino', city: 'Sorocaba', uf: 'SP', emp: 90, units: 4,
        status: 'active_client', startM: 14, renewalD: 60, churn: 'alto', expansion: false, contact: ['Patrícia Gomes', 'Coordenadora Geral'],
        followups: [['risco', 'Uso caiu no último mês; diretora trocou. Agendar conversa de retenção URGENTE.'], ['renovacao', 'Renovação em 60 dias — preparar proposta de continuidade.']],
        opp: { name: 'Programa completo — Instituto Horizonte', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 42000 },
        proposal: { status: 'accepted', package: 'completo', months: 12, monthly: 3500, comm: 'forecast', doc: false } },
      { legal: 'TechNova Sistemas LTDA', trade: 'TechNova Sistemas', seg: 'empresa', city: 'São Paulo', uf: 'SP', emp: 210, units: 1,
        status: 'active_client', startM: 5, renewalD: 180, churn: 'baixo', expansion: false, contact: ['Juliana Rocha', 'Head de T&D'],
        followups: [['followup', 'RH satisfeito com o Evolution Report; possível case.']],
        opp: { name: 'Desenvolvimento de lideranças — TechNova', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 120000 },
        proposal: { status: 'accepted', package: 'completo', months: 24, monthly: 5000, comm: 'forecast', doc: false } },
      // ── PIPELINE / PROPOSTAS (vários status) ────────────────────────────
      { legal: 'Grupo Educacional Vértice LTDA', trade: 'Grupo Educacional Vértice', seg: 'escola', city: 'Jundiaí', uf: 'SP', emp: 130, units: 3,
        status: 'prospect', contact: ['Roberto Dias', 'Mantenedor'],
        opp: { name: 'Programa completo — Grupo Vértice', stage: 'negociacao', st: 'open', product: 'completo', value: 96000, score: 82,
               competitors: 'Qulture Rocks', objections: 'Preço acima do orçamento previsto', need: 'Padronizar desenvolvimento de coordenadores das 3 unidades.', protD: 62 },
        proposal: { status: 'submitted_for_approval', package: 'completo', months: 24, monthly: 4000, comm: null, doc: false } },
      { legal: 'Secretaria Municipal de Educação de Valinhos', trade: 'SME Valinhos', seg: 'rede_ensino', city: 'Valinhos', uf: 'SP', emp: 400, units: 22,
        status: 'prospect', contact: ['Ana Beatriz Santos', 'Secretária de Educação'],
        opp: { name: 'Piloto — SME Valinhos', stage: 'diagnostico_reuniao_realizada', st: 'open', product: 'mentor_ia', value: 18000, score: 58,
               need: 'Formação de gestores escolares por dispensa de licitação.', protD: 80 },
        proposal: { status: 'draft', package: 'mentor_ia', months: 12, monthly: 1500, comm: null, doc: false } },
      { legal: 'Laticínios Bela Vista LTDA', trade: 'Laticínios Bela Vista', seg: 'empresa', city: 'Piracicaba', uf: 'SP', emp: 160, units: 2,
        status: 'prospect', contact: ['Marcos Pereira', 'Gerente de RH'],
        opp: { name: 'Mentor IA — Laticínios Bela Vista', stage: 'contrato_enviado', st: 'open', product: 'completo', value: 54000, score: 88,
               need: 'Desenvolver líderes de produção com base em perfil.', protD: 40 },
        proposal: { status: 'sent_to_client', package: 'completo', months: 12, monthly: 4500, comm: null, doc: true } },
      { legal: 'Fundação Semear', trade: 'Fundação Semear', seg: 'fundacao', city: 'São Paulo', uf: 'SP', emp: 70, units: 1,
        status: 'prospect', contact: ['Lúcia Ferreira', 'Diretora Executiva'],
        opp: { name: 'Piloto — Fundação Semear', stage: 'negociacao', st: 'open', product: 'mentor_ia', value: 21000, score: 70,
               need: 'Desenvolver coordenadores de projetos sociais.', protD: 55 },
        proposal: { status: 'approved', package: 'mentor_ia', months: 12, monthly: 1750, comm: null, doc: true } },
      { legal: 'Colégio São Bento LTDA', trade: 'Colégio São Bento', seg: 'escola', city: 'Ribeirão Preto', uf: 'SP', emp: 85, units: 1,
        status: 'prospect', contact: ['Eduardo Nunes', 'Diretor Geral'],
        opp: { name: 'Programa completo — Colégio São Bento', stage: 'proposta_enviada', st: 'open', product: 'completo', value: 60000, score: 65,
               objections: 'Professores resistentes a nova plataforma', need: 'Reduzir rotatividade docente.', protD: 70 },
        proposal: { status: 'changes_requested', package: 'completo', months: 12, monthly: 5000, comm: null, doc: false, rejection: 'Rever escopo: incluir só coordenação no piloto.' } },
      { legal: 'MetalTech Indústria LTDA', trade: 'MetalTech', seg: 'empresa', city: 'São Bernardo', uf: 'SP', emp: 500, units: 1,
        status: 'prospect', contact: ['Sandra Oliveira', 'CHRO'],
        opp: { name: 'Desenvolvimento de sucessão — MetalTech', stage: 'negociacao', st: 'open', product: 'completo', value: 144000, score: 60,
               competitors: 'Feedz', need: 'Pipeline de sucessão para gerências.', protD: 30 },
        proposal: { status: 'rejected', package: 'completo', months: 24, monthly: 6000, comm: null, doc: false, rejection: 'Desconto solicitado (25%) inviabiliza a margem.' } },
      { legal: 'Escola Criativa LTDA', trade: 'Escola Criativa', seg: 'escola', city: 'Santos', uf: 'SP', emp: 40, units: 1,
        status: 'lost', contact: ['Paulo Ramos', 'Coordenador'],
        opp: { name: 'Piloto — Escola Criativa', stage: 'fechado_perdido', st: 'lost', product: 'mentor_ia', value: 15000, score: 45, loss: 'Sem orçamento neste ciclo.' },
        proposal: { status: 'lost', package: 'mentor_ia', months: 12, monthly: 1250, comm: null, doc: false } },
    ],
  },
  'demo-rc-mariana@vertho.ai': {
    accounts: [
      { legal: 'Colégio Farol do Saber LTDA', trade: 'Colégio Farol', seg: 'escola', city: 'Curitiba', uf: 'PR', emp: 60, units: 1,
        status: 'active_client', startM: 4, renewalD: 120, churn: 'baixo', expansion: false, contact: ['Beatriz Lima', 'Diretora'],
        opp: { name: 'Programa completo — Colégio Farol', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 45600 },
        proposal: { status: 'accepted', package: 'completo', months: 12, monthly: 3800, comm: 'accrued', doc: false } },
      { legal: 'Rede Conhecer S/A', trade: 'Rede Conhecer', seg: 'rede_ensino', city: 'Londrina', uf: 'PR', emp: 180, units: 6,
        status: 'active_client', startM: 2, renewalD: 300, churn: 'baixo', expansion: true, contact: ['André Souza', 'Diretor Pedagógico'],
        opp: { name: 'Programa completo — Rede Conhecer', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 100800 },
        proposal: { status: 'accepted', package: 'completo', months: 24, monthly: 4200, comm: 'forecast', doc: false } },
      { legal: 'Indústria Alfa LTDA', trade: 'Indústria Alfa', seg: 'empresa', city: 'Joinville', uf: 'SC', emp: 240, units: 1,
        status: 'prospect', contact: ['Renata Dias', 'Gerente de RH'],
        opp: { name: 'Desenvolvimento de líderes — Alfa', stage: 'negociacao', st: 'open', product: 'completo', value: 96000, score: 72,
               need: 'Formar líderes de chão de fábrica.', protD: 50 },
        proposal: { status: 'submitted_for_approval', package: 'completo', months: 24, monthly: 4000, comm: null, doc: false } },
      { legal: 'Escola Aurora LTDA', trade: 'Escola Aurora', seg: 'escola', city: 'Florianópolis', uf: 'SC', emp: 35, units: 1,
        status: 'lost', contact: ['Tiago Melo', 'Diretor'],
        opp: { name: 'Piloto — Escola Aurora', stage: 'fechado_perdido', st: 'lost', product: 'mentor_ia', value: 15000, score: 40, loss: 'Escolheu concorrente (LMS).' },
        proposal: { status: 'lost', package: 'mentor_ia', months: 12, monthly: 1250, comm: null, doc: false } },
    ],
  },
  'demo-rc-rafael@vertho.ai': {
    accounts: [
      { legal: 'Grupo Educacional Atlântico S/A', trade: 'Grupo Atlântico', seg: 'escola', city: 'Rio de Janeiro', uf: 'RJ', emp: 260, units: 5,
        status: 'active_client', startM: 6, renewalD: 40, churn: 'medio', expansion: true, contact: ['Vanessa Cardoso', 'Head de Pessoas'],
        followups: [['renovacao', 'Renovação em 40 dias; grupo satisfeito, propor expansão junto.']],
        opp: { name: 'Programa completo — Grupo Atlântico', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 108000 },
        proposal: { status: 'accepted', package: 'completo', months: 24, monthly: 4500, comm: 'paid', doc: true } },
      { legal: 'Secretaria de Educação de Niterói', trade: 'SME Niterói', seg: 'rede_ensino', city: 'Niterói', uf: 'RJ', emp: 350, units: 18,
        status: 'prospect', contact: ['Gustavo Pinto', 'Secretário Adjunto'],
        opp: { name: 'Piloto — SME Niterói', stage: 'diagnostico_reuniao_realizada', st: 'open', product: 'mentor_ia', value: 18000, score: 55,
               need: 'Formação de diretores por dispensa de licitação.', protD: 75 },
        proposal: { status: 'approved', package: 'mentor_ia', months: 12, monthly: 1500, comm: null, doc: true } },
      { legal: 'Seguradora Confiança S/A', trade: 'Seguradora Confiança', seg: 'empresa', city: 'Rio de Janeiro', uf: 'RJ', emp: 420, units: 1,
        status: 'prospect', contact: ['Camila Ribeiro', 'Diretora de RH'],
        opp: { name: 'Sucessão de lideranças — Confiança', stage: 'negociacao', st: 'open', product: 'completo', value: 144000, score: 68,
               competitors: 'Gupy', need: 'Mapear e desenvolver sucessores.', protD: 45 },
        proposal: { status: 'sent_to_client', package: 'completo', months: 24, monthly: 6000, comm: null, doc: true } },
    ],
  },
};

let propSeq = 1;

async function ensureRep(client, rep) {
  const users = await (await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=1000`, { headers: hdrs })).json();
  const userId = users?.users?.find((u) => u.email?.toLowerCase() === rep.email)?.id ?? null;
  const ex = (await client.query('SELECT id FROM sales_representatives WHERE email=$1', [rep.email])).rows[0];
  if (ex) {
    await client.query("UPDATE sales_representatives SET name=$1, region=$2, status='active', user_id=COALESCE($3,user_id) WHERE id=$4", [rep.name, rep.region, userId, ex.id]);
    return ex.id;
  }
  return (await client.query("INSERT INTO sales_representatives (email,name,region,status,user_id) VALUES ($1,$2,$3,'active',$4) RETURNING id", [rep.email, rep.name, rep.region, userId])).rows[0].id;
}

async function cleanRep(client, repId) {
  for (const t of ['sales_commission_events', 'sales_activity_notes', 'sales_proposals', 'sales_opportunities', 'sales_contacts', 'sales_accounts']) {
    await client.query(`DELETE FROM ${t} WHERE representante_id=$1`, [repId]);
  }
}

async function insertCommissions(client, repId, propId, accId, p, seq) {
  const total = p.monthly * p.months;
  const acq = round2(total * 0.09);
  const rec = round2(p.monthly * 0.12);
  const now = new Date();
  const nf = `NF-D${String(seq).padStart(3, '0')}`;
  const rows = [];
  // aquisição
  let acqStatus = 'forecast', acqPaid = null, acqInv = null, acqInvAt = null;
  if (p.comm === 'accrued') { acqStatus = 'accrued'; acqInv = nf; acqInvAt = ymd(monthsAgo(1)); }
  if (p.comm === 'paid') { acqStatus = 'paid'; acqInv = nf; acqInvAt = ymd(monthsAgo(2)); acqPaid = ymd(monthsAgo(1)); }
  rows.push({ type: 'aquisicao', status: acqStatus, base: total, pct: 9, amount: acq, ref: null, exp: ymd(firstOfMonthPlus(1)), paid: acqPaid, inv: acqInv, invAt: acqInvAt });
  // recorrentes
  for (let i = 0; i < p.months; i++) {
    let st = 'forecast', paid = null;
    if (p.comm === 'accrued' && i < 2) st = 'accrued';
    if (p.comm === 'paid') { if (i < 3) { st = 'paid'; paid = ymd(firstOfMonthPlus(i - 1)); } else if (i < 5) st = 'accrued'; }
    rows.push({ type: 'recorrente', status: st, base: p.monthly, pct: 12, amount: rec, ref: ymd(firstOfMonthPlus(i)), exp: ymd(firstOfMonthPlus(i + 1)), paid, inv: null, invAt: null });
  }
  for (const r of rows) {
    await client.query(
      `INSERT INTO sales_commission_events (representante_id,proposal_id,account_id,type,status,base_value,percent,amount,reference_month,expected_payment_date,paid_at,invoice_number,invoice_issued_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [repId, propId, accId, r.type, r.status, r.base, r.pct, r.amount, r.ref, r.exp, r.paid, r.inv, r.invAt]);
  }
}

async function run() {
  const client = new Client({ connectionString: env('DATABASE_URL'), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const rep of REPS) {
      const repId = await ensureRep(client, rep);
      await cleanRep(client, repId);
      if (CLEAN_ONLY) { console.log(`limpo: ${rep.email}`); continue; }
      const ds = DATA[rep.email];
      let accN = 0, oppN = 0, propN = 0, commN = 0;
      for (const a of ds.accounts) {
        const startDate = a.status === 'active_client' && a.startM != null ? ymd(monthsAgo(a.startM)) : null;
        const renewal = a.status === 'active_client' && a.renewalD != null ? ymd(daysFromNow(a.renewalD)) : null;
        const acc = (await client.query(
          `INSERT INTO sales_accounts (representante_id,legal_name,trade_name,segment,city,state,number_of_employees,number_of_units,status,contract_start_date,renewal_date,churn_risk,expansion_potential)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [repId, a.legal, a.trade, a.seg, a.city, a.uf, a.emp, a.units, a.status, startDate, renewal, a.churn ?? null, !!a.expansion])).rows[0];
        accN++;
        let contactId = null;
        if (a.contact) contactId = (await client.query(
          "INSERT INTO sales_contacts (account_id,representante_id,name,role,is_primary) VALUES ($1,$2,$3,$4,true) RETURNING id",
          [acc.id, repId, a.contact[0], a.contact[1]])).rows[0].id;

        let oppId = null;
        if (a.opp) {
          const o = a.opp;
          const protStart = o.protD != null ? ymd(monthsAgo(0)) : null;
          const protEnd = o.protD != null ? ymd(daysFromNow(o.protD)) : null;
          const protStatus = o.protD != null ? (o.protD <= 15 ? 'expiring' : 'active') : 'active';
          oppId = (await client.query(
            `INSERT INTO sales_opportunities (representante_id,account_id,primary_contact_id,opportunity_name,origin,product_interest,identified_need,stage,status,estimated_value,quality_score,protection_start_date,protection_end_date,protection_status,competitors,objections,loss_reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
            [repId, acc.id, contactId, o.name, o.st === 'won' ? 'indicacao' : 'prospeccao', o.product ?? null, o.need ?? null, o.stage, o.st, o.value ?? null, o.score ?? 100, protStart, protEnd, protStatus, o.competitors ?? null, o.objections ?? null, o.loss ?? null])).rows[0].id;
          oppN++;
        }

        if (a.proposal) {
          const p = a.proposal;
          const total = p.monthly * p.months;
          const acq = round2(total * 0.09), recTot = round2(p.monthly * 0.12 * p.months);
          const token = p.doc ? crypto.randomBytes(12).toString('base64url') : null;
          const approvedAt = ['approved', 'sent_to_client', 'accepted'].includes(p.status) ? new Date().toISOString() : null;
          const approvedBy = approvedAt ? 'rodrigo@vertho.ai' : null;
          const firstViewed = p.doc && ['sent_to_client', 'accepted'].includes(p.status) ? ymd(daysFromNow(-3)) : null;
          const prop = (await client.query(
            `INSERT INTO sales_proposals (representante_id,opportunity_id,account_id,proposal_number,customer_type,product_package,contract_duration_months,monthly_value,total_contract_value,included_scope,commercial_notes,estimated_acquisition_commission,estimated_recurring_commission,estimated_total_commission,status,approved_by,approved_at,rejection_reason,public_token,first_viewed_at,view_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
            [repId, oppId, acc.id, `PROP-2026-D${String(propSeq).padStart(3, '0')}`, a.seg, p.package, p.months, p.monthly, total,
             'Diagnóstico individual + trilha personalizada + Mentor IA + Evolution Report', p.notes ?? null,
             acq, recTot, round2(acq + recTot), p.status, approvedBy, approvedAt, p.rejection ?? null, token, firstViewed, firstViewed ? 2 : 0])).rows[0];
          propSeq++; propN++;
          if (p.status === 'accepted' && p.comm) { await insertCommissions(client, repId, prop.id, acc.id, p, propSeq); commN += p.months + 1; }
        }

        if (a.followups) for (const [kind, note] of a.followups) {
          await client.query("INSERT INTO sales_activity_notes (representante_id,account_id,opportunity_id,kind,note,created_by_email) VALUES ($1,$2,null,$3,$4,$5)",
            [repId, acc.id, kind, note, rep.email]);
        }
      }
      console.log(`${rep.email}: ${accN} contas, ${oppN} oportunidades, ${propN} propostas, ~${commN} comissões`);
    }
  } finally {
    await client.end();
  }
}
run();
