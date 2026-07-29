/**
 * Com qual autor a resposta final se parece mais?
 *
 *   node --env-file=.env.local scripts/painel/_parecidos.mjs <id>
 *
 * Duas leituras, de propósito:
 *  1. o que a SÍNTESE declara ter pegado de cada um (`creditos`);
 *  2. uma medida independente de sobreposição de vocabulário entre a resposta
 *     final e cada proposta final.
 *
 * A segunda existe porque a primeira é auto-relato: um juiz pode creditar um
 * autor e escrever o texto do outro. Quando as duas discordam, a discordância é
 * o achado.
 */
import { createClient } from '@supabase/supabase-js'

const [id] = process.argv.slice(2)
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: p, error } = await sb.from('board_paineis').select('resultado').eq('id', id).single()
if (error) { console.error(error.message); process.exit(1) }

const r = p.resultado || {}
const s = r.sintese || {}

// ---------------------------------------------------------------- 1. declarado
console.log('O QUE A SÍNTESE DIZ TER PEGADO DE CADA UM:')
for (const c of s.creditos || []) {
  const autor = (r.autores || []).find((a) => a.letra === c.letra)
  console.log(`  ${c.letra} (${autor?.nome || '?'}): ${c.contribuicao}`)
}

// ---------------------------------------------------------------- 2. medido
/** Palavras de conteúdo: fora as curtas e as muito comuns em português. */
const VAZIAS = new Set(
  ('a o e de da do das dos em no na nos nas um uma uns umas para por com que se ao aos as os pelo pela como mais menos ' +
   'seu sua seus suas isso este esta esse essa aquele aquela ser ter fazer estar entre sobre sem sob ate apos cada qual ' +
   'quando onde porque porem mas ou nem tambem ja nao sim eles elas nós você vocês').split(' '),
)

function termos(txt) {
  return new Set(
    String(txt || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 4 && !VAZIAS.has(t)),
  )
}

const final = termos(s.resposta_final)
console.log(`\nSOBREPOSIÇÃO DE VOCABULÁRIO COM A RESPOSTA FINAL (${final.size} termos de conteúdo):`)

const linhas = (r.rodada2 || []).map((autor) => {
  const t = termos(autor.proposta_final)
  const comuns = [...t].filter((x) => final.has(x)).length
  // Jaccard: penaliza tanto o autor que fala pouco quanto o que fala demais
  const jaccard = comuns / (new Set([...t, ...final]).size || 1)
  // cobertura: quanto da resposta final aparece nesse autor
  const cobertura = comuns / (final.size || 1)
  return { letra: autor.letra, nome: autor.nome, comuns, jaccard, cobertura }
})

linhas.sort((a, b) => b.cobertura - a.cobertura)
for (const l of linhas) {
  const barra = '█'.repeat(Math.round(l.cobertura * 40))
  console.log(
    `  ${l.letra} ${String(l.nome).padEnd(18)} ${(l.cobertura * 100).toFixed(1).padStart(5)}% da resposta  ${barra}`,
  )
}

const [primeiro, segundo] = linhas
if (primeiro && segundo) {
  const dif = ((primeiro.cobertura - segundo.cobertura) * 100).toFixed(1)
  console.log(
    `\nMais próximo: ${primeiro.letra} (${primeiro.nome}), ${dif} pontos à frente de ${segundo.letra}.` +
      (Number(dif) < 3 ? ' Diferença pequena — a síntese não copiou ninguém; recombinou.' : ''),
  )
}
