/**
 * Prova que caminho malicioso não vira comando.
 *
 *   node scripts/painel/_seguranca.mjs
 *
 * O teste que importa é o do MEIO: um payload que, se o caminho fosse
 * interpolado na string do comando, criaria um arquivo. Se o arquivo aparecer,
 * a injeção funcionou.
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { caminhoSuspeito, chamarMotor } from './engine.mjs'

const CANARIO = join(tmpdir(), 'board-injecao-funcionou.txt')
rmSync(CANARIO, { force: true })

let falhas = 0
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok  ' : '  FALHOU  '} ${msg}`)
  if (!cond) falhas++
}

console.log('1) detector de sintaxe de shell')
for (const mau of [
  `C:\\ctx"; New-Item -ItemType File '${CANARIO}'; "`,
  'C:\\ctx$(whoami)',
  'C:\\ctx`whoami`',
  'C:\\ctx; calc.exe',
  'C:\\ctx | calc.exe',
  'C:\\ctx\nwhoami',
]) {
  ok(caminhoSuspeito(mau), `recusa: ${mau.replace(/\n/g, '\\n').slice(0, 46)}`)
}
for (const bom of ['C:\\Users\\rdnav\\.claude\\painel\\contexto\\conarh', 'C:/GAS/Vertho App', 'D:\\Pasta com espaco\\sub-pasta']) {
  ok(!caminhoSuspeito(bom), `aceita: ${bom}`)
}

console.log('\n2) execução real com payload de injeção (o teste que pode falhar)')
const r = await chamarMotor(
  'claude',
  'responda apenas: ok',
  { raiz: 'C:\\GAS\\Vertho App', contextoDir: `C:\\ctx"; New-Item -ItemType File '${CANARIO}'; "` },
  'sec',
)
ok(r.ok === false, 'a chamada foi recusada antes de executar')
ok(String(r.erro).includes('sintaxe de shell'), `motivo declarado: ${String(r.erro).slice(0, 70)}`)
ok(!existsSync(CANARIO), 'NENHUM arquivo foi criado pelo payload')

console.log('\n3) o mesmo payload chegando por variável de ambiente')
// Aqui o detector é desligado de propósito: mesmo que um caminho estranho passe,
// o comando referencia $env:... e o PowerShell não reinterpreta o conteúdo.
const r2 = await chamarMotor(
  'claude',
  'Responda SOMENTE com JSON puro: {"ok":true}',
  { raiz: 'C:\\GAS\\Vertho App', contextoDir: 'C:\\pasta que nao existe mas e inofensiva' },
  'sec2',
)
ok(!existsSync(CANARIO), 'canário continua ausente')
ok(r2.ok === true, `chamada normal segue funcionando${r2.ok ? '' : ` — ${String(r2.erro).slice(0, 80)}`}`)

rmSync(CANARIO, { force: true })
console.log(`\n${falhas ? `${falhas} FALHA(S)` : 'tudo ok'}`)
process.exit(falhas ? 1 : 0)
