/**
 * Cada CLI tem uma regra de workspace diferente, e o gate de permissão em modo
 * headless não avisa: ele simplesmente devolve uma resposta sem o dado.
 *
 * Este teste pergunta a cada motor um segredo que SÓ existe num arquivo fora do
 * diretório de trabalho. Quem responde, leu. Quem não responde, não leu — e é
 * melhor descobrir aqui do que num painel de 20 minutos.
 *
 *   node scripts/painel/_leitura.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chamarMotor, MOTORES } from './engine.mjs'

const DIR = join(tmpdir(), 'board-teste-leitura')
const SEGREDO = `ALCATRAZ-${Math.floor(Math.random() * 9000 + 1000)}`

mkdirSync(DIR, { recursive: true })
writeFileSync(join(DIR, 'nota.md'), `# Nota\n\nO codigo de operacao e ${SEGREDO}.\n`, 'utf8')

const prompt = `Leia o arquivo ${join(DIR, 'nota.md')} e responda SOMENTE com JSON puro, sem cercas:
{"codigo":"<o codigo que esta no arquivo>"}
Se voce NAO conseguir abrir o arquivo, responda {"codigo":"NAO CONSEGUI LER"} -- nao adivinhe.`

const ctx = { contextoDir: DIR, raiz: process.cwd() }
const ids = Object.keys(MOTORES)

console.log(`segredo plantado em ${DIR}\\nota.md (fora do diretorio de trabalho)\n`)

const rs = await Promise.all(ids.map((id) => chamarMotor(id, prompt, ctx, 'leitura')))

let leram = 0
rs.forEach((r, i) => {
  const m = MOTORES[ids[i]]
  const codigo = r.ok ? String(r.dados?.codigo ?? '') : `(falhou: ${String(r.erro).slice(0, 60)})`
  const leu = codigo === SEGREDO
  if (leu) leram++
  console.log(`${m.letra} ${m.nome.padEnd(18)} ${String(r.segundos ?? '?').padStart(3)}s  ${leu ? 'LEU' : 'não leu'}  ${codigo}`)
})

rmSync(DIR, { recursive: true, force: true })
console.log(`\n${leram}/${ids.length} motores leram o arquivo`)
process.exit(leram === ids.length ? 0 : 1)
