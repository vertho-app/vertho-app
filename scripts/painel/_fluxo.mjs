/**
 * Percorre rodarPainel() DE PONTA A PONTA com motores falsos — sem gastar cota,
 * em milissegundos.
 *
 *   node scripts/painel/_fluxo.mjs
 *
 * Existe por causa de um bug que nenhum teste pegava: `log()` (função do worker)
 * foi usada dentro de painel.mjs, num `if` que só dispara QUANDO algum autor
 * cita fonte inexistente. Os painéis anteriores tinham 0 citações quebradas, e
 * o erro só apareceu em produção — matando uma corrida de 20 minutos.
 *
 * A regra que este arquivo encarna: caminho raro tem de ser percorrido por
 * alguém ANTES do usuário. Por isso o cenário padrão aqui é o cenário RARO.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { rodarPainel } from './painel.mjs'

const DIR = join(tmpdir(), 'board-fluxo-teste')
mkdirSync(DIR, { recursive: true })
writeFileSync(join(DIR, 'nota.md'), '# nota\n\nconteudo de apoio\n', 'utf8')

/** Motor falso: responde na hora, no formato de cada contrato. */
function motorFalso({ quebrarFonte = true, falharEm = null } = {}) {
  return async (id, _prompt, _ctx, tag) => {
    if (falharEm === `${tag}:${id}`) return { ok: false, erro: 'falha simulada', segundos: 1 }

    if (tag === 'r1') {
      return {
        ok: true,
        segundos: 1,
        dados: {
          proposta: `Proposta de ${id}.`,
          resumo: `Resumo de ${id}.`,
          premissas: ['premissa'],
          evidence: [
            { claim: 'algo real', provenance: 'Medido', source: 'package.json' },
            ...(quebrarFonte
              ? [{ claim: 'inventado', provenance: 'Medido', source: 'actions/nao-existe-mesmo.ts:42' }]
              : []),
          ],
          riscos: ['risco'],
          confidence: 0.8,
        },
      }
    }
    if (tag === 'r2') {
      return {
        ok: true,
        segundos: 1,
        dados: {
          proposta_final: `Final de ${id}.`,
          resumo: `Resumo final de ${id}.`,
          o_que_mudou_desde_r1: 'nada',
          premissa_comum: { premissa: 'todos assumiram X', tentativa_de_refutacao: 'talvez não', sobreviveu: false },
          recusou: [{ ideia: 'ideia alheia', de: 'B', porque: 'não cabe' }],
          ainda_em_disputa: ['ponto'],
          riscos: ['risco'],
          confidence: 0.9,
        },
      }
    }
    return {
      ok: true,
      segundos: 1,
      dados: {
        resposta_final: 'Resposta final.',
        resumo: 'Resumo da síntese.',
        racional: 'porque sim',
        creditos: [{ letra: 'A', contribuicao: 'tese' }],
        ideias_orfas_resgatadas: [{ ideia: 'i', de: 'A', por_que_resgatar: 'boa' }],
        divergencias_reais: [{ ponto: 'p', posicoes: 'x vs y' }],
        avaliacao_da_convergencia: 'mista',
        riscos: [],
        next_steps: ['passo'],
        unverified_claims: [],
        confidence: 0.8,
      },
    }
  }
}

let falhas = 0
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FALHOU  '} ${m}`); if (!c) falhas++ }

const pedido = { pergunta: 'Pergunta de teste?', contexto_dir: DIR, raiz: process.cwd() }

console.log('1) fluxo completo COM citação quebrada (o caminho que quebrou em produção)')
{
  const eventos = []
  const r = await rodarPainel(pedido, (e) => eventos.push(e), { chamar: motorFalso({ quebrarFonte: true }) })
  ok(!r.erro, `o painel não estourou${r.erro ? ` — ${r.erro}` : ''}`)
  ok(r.presenca.r2.length === 4, `os 4 chegaram ao fim (${r.presenca?.r2?.length})`)
  ok(r.verificacao.resumo.quebradas === 4, `as fontes inventadas foram pegas (${r.verificacao?.resumo?.quebradas})`)
  ok(eventos.some((e) => e.fase === 'verificacao'), 'o evento de verificação foi emitido')
  ok(!!r.sintese, 'a síntese saiu')
  ok(r.premissas_comuns.length === 4, `premissa comum de cada autor (${r.premissas_comuns?.length})`)
}

console.log('\n2) fluxo SEM citação quebrada')
{
  const r = await rodarPainel(pedido, () => {}, { chamar: motorFalso({ quebrarFonte: false }) })
  ok(!r.erro && r.verificacao.resumo.quebradas === 0, 'nenhuma fonte acusada indevidamente')
  ok(r.verificacao.tetos.every((t) => !t.estourou), 'com evidência medida e conferida, ninguém estoura o teto')
}

console.log('\n3) um motor cai na rodada 1')
{
  const r = await rodarPainel(pedido, () => {}, { chamar: motorFalso({ falharEm: 'r1:codex' }) })
  ok(!r.erro, 'o painel segue com os que sobraram')
  ok(r.presenca.perdidos.some((p) => p.letra === 'B'), 'o motor caído é reportado como perdido')
  ok(r.presenca.r2.length === 3, `a resposta sai com 3 autores (${r.presenca?.r2?.length})`)
}

rmSync(DIR, { recursive: true, force: true })
console.log(`\n${falhas ? `${falhas} FALHA(S)` : 'tudo ok'}`)
process.exit(falhas ? 1 : 0)
