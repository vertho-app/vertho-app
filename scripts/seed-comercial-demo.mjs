// Popula as telas comerciais (Carteira, Propostas, Comissões) com dados de
// DEMONSTRAÇÃO, nas regras do contrato de representação v5 (22/10/2026): dois
// RCs fictícios dão volume às visões de canal do admin, um em cada modelo de
// remuneração, com um caso de cliente da carteira aguardando aprovação.
//
// A comissão NÃO é calculada aqui: vem de `planoDeComissao`/`eventosDoPlano`
// (lib/sales/commissions.ts), as mesmas funções do portal. Por isso o script
// roda com tsx, a partir da RAIZ do app (o `_pg-ssl` procura `config/` no
// diretório atual):
//   npx tsx --env-file=.env.local scripts/seed-comercial-demo.mjs
//   npx tsx --env-file=.env.local scripts/seed-comercial-demo.mjs --clean   (só remove)
//   npx tsx --env-file=.env.local scripts/seed-comercial-demo.mjs --ensaio  (grava, confere e desfaz)
//
// Idempotente: apaga e reinsere os dados dos RCs da lista, um RC por transação.
// 🔴 O dono (rodrigo@vertho.ai) NÃO está mais na lista (23/10/2026): até 07/2026
// ele era o "hero" deste seed, mas hoje a conta dele tem prospects REAIS, e o
// `cleanRep` apagaria tudo.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { sslSupabase } from './_pg-ssl.mjs';
import { calculateProposalFinancials, eventosDoPlano, planoDeComissao } from '../lib/sales/commissions';
import { commissionRatesFor } from '../lib/sales/constants';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

// Variáveis do ambiente (`--env-file`); o `.env.local` ao lado só como reserva.
const arquivoEnv = new URL('../.env.local', import.meta.url);
const ENV = fs.existsSync(arquivoEnv) ? fs.readFileSync(arquivoEnv, 'utf8') : '';
const env = (k) => process.env[k] || ENV.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const CLEAN_ONLY = process.argv.includes('--clean');
const ENSAIO = process.argv.includes('--ensaio');
const URL_ = env('NEXT_PUBLIC_SUPABASE_URL'); const SR = env('SUPABASE_SERVICE_ROLE_KEY');
const hdrs = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };
const APROVADOR = 'rodrigo@vertho.ai';

const ymd = (d) => d.toISOString().slice(0, 10);
const HOJE = new Date();
const diasDesdeHoje = (n) => { const d = new Date(HOJE); d.setDate(d.getDate() + n); return d; };
/** 1º dia do mês, `m` meses antes do atual (UTC). */
const inicioDoMes = (m) => new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth() - m, 1));
const somaMeses = (d, m) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()));
const MES_ATUAL = ymd(inicioDoMes(0));
// 'completo' saiu da oferta → 'custom'.
const resolvePkg = (raw) => (raw === 'completo' ? 'custom' : raw ?? null);

const REPS = [
  { email: 'demo-rc-mariana@vertho.ai', name: 'Mariana Costa', region: 'SP', modelo: 'sem_ajuda' },
  { email: 'demo-rc-rafael@vertho.ai', name: 'Rafael Lima', region: 'RJ', modelo: 'com_ajuda' },
];

// Dataset por RC. `num` mantém o número da proposta entre execuções.
// `historia` diz até onde o financeiro andou nas competências já vencidas:
//   'paga'      → pagamento previsto já passou: paga (com NF); o resto vencido fica "a receber";
//   'a_receber' → o cliente pagou, mas o financeiro ainda não pagou nada;
//   'prevista'  → o financeiro ainda não reconheceu nenhum pagamento.
// `expansao`: segunda oportunidade na mesma conta (cliente da carteira, 50%).
const DATA = {
  'demo-rc-mariana@vertho.ai': {
    accounts: [
      { legal: 'Colégio Farol do Saber LTDA', trade: 'Colégio Farol', seg: 'escola', city: 'Curitiba', uf: 'PR', emp: 60, units: 1,
        status: 'active_client', startM: 4, churn: 'baixo', expansion: false, contact: ['Beatriz Lima', 'Diretora'],
        opp: { name: 'Programa — Colégio Farol', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 45600 },
        proposal: { num: 'D012', status: 'accepted', package: 'completo', months: 12, monthly: 3800, historia: 'a_receber', doc: false } },
      { legal: 'Rede Conhecer S/A', trade: 'Rede Conhecer', seg: 'rede_ensino', city: 'Londrina', uf: 'PR', emp: 180, units: 6,
        status: 'active_client', startM: 2, churn: 'baixo', expansion: true, contact: ['André Souza', 'Diretor Pedagógico'],
        followups: [['expansao', 'Interesse em estender a Jornada aos coordenadores das 6 unidades.']],
        opp: { name: 'Programa — Rede Conhecer', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 100800 },
        proposal: { num: 'D013', status: 'accepted', package: 'completo', months: 24, monthly: 4200, historia: 'prevista', doc: false },
        expansao: {
          opp: { name: 'Expansão — Rede Conhecer (coordenadores)', stage: 'aguardando_aceite_vertho', st: 'open', product: 'completo', value: 21600, score: 90,
                 need: 'Levar a Jornada aos coordenadores das 6 unidades.', protD: 85 },
          proposal: { num: 'D019', status: 'submitted_for_approval', package: 'completo', months: 12, monthly: 1800, doc: false } } },
      { legal: 'Indústria Alfa LTDA', trade: 'Indústria Alfa', seg: 'empresa', city: 'Joinville', uf: 'SC', emp: 240, units: 1,
        status: 'prospect', contact: ['Renata Dias', 'Gerente de RH'],
        opp: { name: 'Desenvolvimento de líderes — Alfa', stage: 'negociacao', st: 'open', product: 'completo', value: 96000, score: 72,
               need: 'Formar líderes de chão de fábrica.', protD: 50 },
        proposal: { num: 'D014', status: 'submitted_for_approval', package: 'completo', months: 24, monthly: 4000, doc: false } },
      { legal: 'Escola Aurora LTDA', trade: 'Escola Aurora', seg: 'escola', city: 'Florianópolis', uf: 'SC', emp: 35, units: 1,
        status: 'lost', contact: ['Tiago Melo', 'Diretor'],
        opp: { name: 'Jornada — Escola Aurora', stage: 'fechado_perdido', st: 'lost', product: 'mentor_ia', value: 15000, score: 40, loss: 'Escolheu concorrente (LMS).' },
        proposal: { num: 'D015', status: 'lost', package: 'mentor_ia', months: 12, monthly: 1250, doc: false } },
    ],
  },
  'demo-rc-rafael@vertho.ai': {
    accounts: [
      { legal: 'Grupo Educacional Atlântico S/A', trade: 'Grupo Atlântico', seg: 'escola', city: 'Rio de Janeiro', uf: 'RJ', emp: 260, units: 5,
        status: 'active_client', startM: 6, churn: 'medio', expansion: true, contact: ['Vanessa Cardoso', 'Head de Pessoas'],
        followups: [['followup', 'Grupo satisfeito com o Relatório do Gestor; propor a expansão para as outras unidades.']],
        opp: { name: 'Programa — Grupo Atlântico', stage: 'fechado_ganho', st: 'won', product: 'completo', value: 108000 },
        proposal: { num: 'D016', status: 'accepted', package: 'completo', months: 24, monthly: 4500, historia: 'paga', doc: true } },
      { legal: 'Secretaria de Educação de Niterói', trade: 'SME Niterói', seg: 'rede_ensino', city: 'Niterói', uf: 'RJ', emp: 350, units: 18,
        status: 'prospect', contact: ['Gustavo Pinto', 'Secretário Adjunto'],
        opp: { name: 'Jornada — SME Niterói', stage: 'diagnostico_reuniao_realizada', st: 'open', product: 'mentor_ia', value: 18000, score: 55,
               need: 'Formação de diretores por dispensa de licitação.', protD: 75 },
        proposal: { num: 'D017', status: 'approved', package: 'mentor_ia', months: 12, monthly: 1500, doc: true } },
      { legal: 'Seguradora Confiança S/A', trade: 'Seguradora Confiança', seg: 'empresa', city: 'Rio de Janeiro', uf: 'RJ', emp: 420, units: 1,
        status: 'prospect', contact: ['Camila Ribeiro', 'Diretora de RH'],
        opp: { name: 'Sucessão de lideranças — Confiança', stage: 'negociacao', st: 'open', product: 'completo', value: 144000, score: 68,
               competitors: 'Gupy', need: 'Mapear e desenvolver sucessores.', protD: 45 },
        proposal: { num: 'D018', status: 'sent_to_client', package: 'completo', months: 24, monthly: 6000, doc: true } },
    ],
  },
};

async function ensureRep(client, rep) {
  const users = await (await fetch(`${URL_}/auth/v1/admin/users?page=1&per_page=1000`, { headers: hdrs })).json();
  const userId = users?.users?.find((u) => u.email?.toLowerCase() === rep.email)?.id ?? null;
  const ex = (await client.query('SELECT id FROM sales_representatives WHERE email=$1', [rep.email])).rows[0];
  if (ex) {
    await client.query(
      "UPDATE sales_representatives SET name=$1, region=$2, status='active', compensation_model=$3, contract_ended_at=NULL, user_id=COALESCE($4,user_id) WHERE id=$5",
      [rep.name, rep.region, rep.modelo, userId, ex.id]);
    return ex.id;
  }
  return (await client.query(
    "INSERT INTO sales_representatives (email,name,region,status,compensation_model,user_id) VALUES ($1,$2,$3,'active',$4,$5) RETURNING id",
    [rep.email, rep.name, rep.region, rep.modelo, userId])).rows[0].id;
}

async function cleanRep(client, repId) {
  for (const t of ['sales_commission_events', 'sales_activity_notes', 'sales_proposals', 'sales_opportunities', 'sales_contacts', 'sales_accounts']) {
    await client.query(`DELETE FROM ${t} WHERE representante_id=$1`, [repId]);
  }
}

/** Status de um evento previsto pela história do contrato e pela data de hoje. */
function estadoDoEvento(e, historia, nf) {
  const vencida = e.reference_month < MES_ATUAL; // o cliente já pagou essa competência
  if (!vencida || historia === 'prevista') return { status: 'forecast' };
  if (historia === 'paga' && e.expected_payment_date < ymd(HOJE)) {
    const pagoEm = new Date(`${e.expected_payment_date}T12:00:00Z`);
    return { status: 'paid', paid_at: pagoEm.toISOString(), invoice_number: nf(), invoice_issued_at: ymd(new Date(pagoEm.getTime() - 5 * 86_400_000)) };
  }
  return { status: 'accrued' };
}

async function insertCommissions(client, repId, propId, accId, plano, inicio, historia, numProposta) {
  let seqNf = 0;
  const nf = () => `NF-${numProposta}-${String(++seqNf).padStart(2, '0')}`;
  const eventos = eventosDoPlano(plano, inicio).map((e) => ({ ...e, ...estadoDoEvento(e, historia, nf) }));
  // Na história "a receber", a 1ª comissão a receber já tem a NF do RC; as demais ficam pendentes.
  const primeiraAReceber = eventos.find((e) => e.status === 'accrued');
  if (primeiraAReceber && historia !== 'prevista') {
    primeiraAReceber.invoice_number = nf();
    primeiraAReceber.invoice_issued_at = ymd(diasDesdeHoje(-3));
  }
  for (const e of eventos) {
    await client.query(
      `INSERT INTO sales_commission_events (representante_id,proposal_id,account_id,type,status,base_value,percent,amount,reference_month,expected_payment_date,paid_at,invoice_number,invoice_issued_at,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [repId, propId, accId, e.type, e.status, e.base_value, e.percent, e.amount, e.reference_month, e.expected_payment_date,
       e.paid_at ?? null, e.invoice_number ?? null, e.invoice_issued_at ?? null, e.notes ?? null]);
  }
  return eventos.length;
}

async function insertOpportunity(client, repId, accId, contactId, o, origem) {
  // Oportunidade aberta: registro validado (90 - protD) dias atrás, proteção até hoje + protD.
  const validadaEm = o.protD != null ? diasDesdeHoje(o.protD - 90) : null;
  const protEnd = o.protD != null ? ymd(diasDesdeHoje(o.protD)) : null;
  const protStatus = o.protD != null ? (o.protD <= 15 ? 'expiring' : 'active') : 'active';
  return (await client.query(
    `INSERT INTO sales_opportunities (representante_id,account_id,primary_contact_id,opportunity_name,origin,product_interest,identified_need,stage,status,estimated_value,quality_score,protection_start_date,protection_end_date,protection_status,competitors,objections,loss_reason,attribution_status,attribution_decided_at,attribution_decided_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'validada',$18,$19) RETURNING id`,
    [repId, accId, contactId, o.name, origem, resolvePkg(o.product), o.need ?? null, o.stage, o.st, o.value ?? null, o.score ?? 100,
     validadaEm ? ymd(validadaEm) : null, protEnd, protStatus, o.competitors ?? null, o.objections ?? null, o.loss ?? null,
     validadaEm ? validadaEm.toISOString() : null, validadaEm ? APROVADOR : null])).rows[0].id;
}

async function insertProposal(client, repId, rep, accId, oppId, seg, p, { inicio, carteira }) {
  const rates = commissionRatesFor(rep.modelo);
  const fin = calculateProposalFinancials({ monthly_value: p.monthly, contract_duration_months: p.months, discount_requested: 0 }, rates, carteira.carteira);
  const plano = planoDeComissao(fin.total_contract_value, p.months, rates, carteira.carteira);
  // Datas coerentes: aceita = aprovada uma semana antes do início e enviada dois dias depois.
  const aprovadaEm = ['approved', 'sent_to_client', 'accepted'].includes(p.status)
    ? (inicio ? new Date(inicio.getTime() - 7 * 86_400_000) : diasDesdeHoje(-10)) : null;
  const enviadaEm = ['sent_to_client', 'accepted'].includes(p.status) && aprovadaEm ? new Date(aprovadaEm.getTime() + 2 * 86_400_000) : null;
  const token = p.doc ? crypto.randomBytes(12).toString('base64url') : null;
  const vista = p.doc && enviadaEm ? ymd(new Date(enviadaEm.getTime() + 86_400_000)) : null;
  const numero = `PROP-2026-${p.num}`;
  const prop = (await client.query(
    `INSERT INTO sales_proposals (representante_id,opportunity_id,account_id,proposal_number,customer_type,product_package,contract_duration_months,monthly_value,
       contract_value_gross,discount_amount,total_contract_value,included_scope,commercial_notes,
       estimated_acquisition_commission,estimated_recurring_commission,estimated_total_commission,margin_alert,
       compensation_model,carteira,carteira_motivo,status,approved_by,approved_at,sent_to_client_at,rejection_reason,public_token,first_viewed_at,view_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING id`,
    [repId, oppId, accId, numero, seg, resolvePkg(p.package), p.months, p.monthly,
     fin.contract_value_gross, fin.discount_amount, fin.total_contract_value,
     'Diagnóstico por competência, Jornada com Mentor IA, Relatório do Gestor e relatório de evolução', p.notes ?? null,
     fin.estimated_acquisition_commission, fin.estimated_recurring_commission, fin.estimated_total_commission, fin.margin_alert,
     rep.modelo, carteira.carteira, carteira.motivo, p.status, aprovadaEm ? APROVADOR : null, aprovadaEm ? aprovadaEm.toISOString() : null,
     enviadaEm ? enviadaEm.toISOString() : null, p.rejection ?? null, token, vista, vista ? 2 : 0])).rows[0];
  let eventos = 0;
  if (p.status === 'accepted') eventos = await insertCommissions(client, repId, prop.id, accId, plano, inicio, p.historia ?? 'prevista', p.num);
  return { id: prop.id, numero, eventos };
}

async function seedRep(client, rep, repId) {
  const ds = DATA[rep.email];
  const n = { contas: 0, oportunidades: 0, propostas: 0, eventos: 0 };
  for (const a of ds.accounts) {
    const inicio = a.status === 'active_client' && a.startM != null ? inicioDoMes(a.startM) : null;
    const meses = a.proposal?.months ?? 12;
    const acc = (await client.query(
      `INSERT INTO sales_accounts (representante_id,legal_name,trade_name,segment,city,state,number_of_employees,number_of_units,status,contract_start_date,renewal_date,churn_risk,expansion_potential)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [repId, a.legal, a.trade, a.seg, a.city, a.uf, a.emp, a.units, a.status,
       inicio ? ymd(inicio) : null, inicio ? ymd(somaMeses(inicio, meses)) : null, a.churn ?? null, !!a.expansion])).rows[0];
    n.contas++;
    const contactId = a.contact ? (await client.query(
      'INSERT INTO sales_contacts (account_id,representante_id,name,role,is_primary) VALUES ($1,$2,$3,$4,true) RETURNING id',
      [acc.id, repId, a.contact[0], a.contact[1]])).rows[0].id : null;

    let aceita = null;
    if (a.opp) {
      const oppId = await insertOpportunity(client, repId, acc.id, contactId, a.opp, a.opp.st === 'won' ? 'indicacao' : 'prospeccao');
      n.oportunidades++;
      if (a.proposal) {
        const r = await insertProposal(client, repId, rep, acc.id, oppId, a.seg, a.proposal, { inicio, carteira: { carteira: false, motivo: null } });
        n.propostas++; n.eventos += r.eventos;
        if (a.proposal.status === 'accepted') aceita = r.numero;
      }
    }
    if (a.expansao) {
      // Cliente da carteira (10.6): a conta já tem proposta aceita deste RC.
      const oppId = await insertOpportunity(client, repId, acc.id, contactId, a.expansao.opp, 'expansao');
      n.oportunidades++;
      const carteira = aceita
        ? { carteira: true, motivo: `Cliente da carteira: a conta já tem a proposta aceita ${aceita}` }
        : { carteira: false, motivo: null };
      await insertProposal(client, repId, rep, acc.id, oppId, a.seg, a.expansao.proposal, { inicio: null, carteira });
      n.propostas++;
    }
    if (a.followups) for (const [kind, note] of a.followups) {
      await client.query('INSERT INTO sales_activity_notes (representante_id,account_id,opportunity_id,kind,note,created_by_email) VALUES ($1,$2,null,$3,$4,$5)',
        [repId, acc.id, kind, note, rep.email]);
    }
  }
  return n;
}

/** Dentro da transação: a soma dos eventos de cada proposta aceita é a estimativa gravada nela. */
async function conferir(client, repId, email) {
  const { rows } = await client.query(
    `SELECT p.proposal_number, p.estimated_total_commission::numeric AS estimativa, COALESCE(SUM(e.amount), 0)::numeric AS eventos
       FROM sales_proposals p LEFT JOIN sales_commission_events e ON e.proposal_id = p.id
      WHERE p.representante_id = $1 AND p.status = 'accepted'
      GROUP BY p.proposal_number, p.estimated_total_commission`, [repId]);
  for (const r of rows) {
    if (Number(r.estimativa) !== Number(r.eventos)) throw new Error(`${email} ${r.proposal_number}: eventos ${r.eventos} ≠ estimativa ${r.estimativa}`);
  }
}

async function run() {
  const client = new Client({ connectionString: env('DATABASE_URL'), ssl: sslSupabase() });
  await client.connect();
  try {
    for (const rep of REPS) {
      // Um RC por transação: falha no meio não deixa o RC pela metade.
      await client.query('BEGIN');
      try {
        const repId = await ensureRep(client, rep);
        await cleanRep(client, repId);
        const n = CLEAN_ONLY ? null : await seedRep(client, rep, repId);
        await conferir(client, repId, rep.email);
        await client.query(ENSAIO ? 'ROLLBACK' : 'COMMIT');
        const feito = ENSAIO ? 'ENSAIO (desfeito)' : 'gravado';
        console.log(n ? `${feito} ${rep.email} (${rep.modelo}): ${n.contas} contas, ${n.oportunidades} oportunidades, ${n.propostas} propostas, ${n.eventos} eventos de comissão` : `limpo: ${rep.email}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
