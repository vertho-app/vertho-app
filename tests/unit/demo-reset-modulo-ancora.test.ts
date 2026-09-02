/**
 * Módulo-base de tenant demo ancora no CATÁLOGO GLOBAL, nunca na competência
 * do tenant.
 *
 * 🔴 O incidente (02/09/2026): o módulo criado para o vídeo da jornada escolar
 * apontava para `competencias` — a tabela POR TENANT, que o reset apaga a cada
 * noite. Ao deletar a competência, o módulo ficava com `competencia_id` e
 * `competencia_base_id` ambos nulos e violava `chk_modulo_competencia`. O
 * delete abortou DEPOIS de já ter limpado colaboradores, trilhas, assessments e
 * respostas: o tenant amanheceu vazio, com 15 pessoas, 11 trilhas e 13
 * devolutivas em voz perdidas.
 *
 * O modo de falha é o pior possível — o reset não "não funciona", ele funciona
 * até a metade e destrói. E nada no repositório reclamava: o typecheck passa, a
 * suíte passa, e a explosão só acontece no reset seguinte.
 *
 * Este guard lê o disco e exige que todo upsert de `modulos_base_conteudo`
 * dentro do reset passe `competencia_base_id` e mantenha `competencia_id: null`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RESET = join(__dirname, '..', '..', 'lib', 'demo', 'reset-acme-demo.ts');
const fonte = readFileSync(RESET, 'utf8');

/** Recorta cada objeto passado a `.from('modulos_base_conteudo').upsert({ … })`. */
function upsertsDeModulo(texto: string): string[] {
  const blocos: string[] = [];
  const marca = "from('modulos_base_conteudo').upsert({";
  let i = texto.indexOf(marca);
  while (i !== -1) {
    // Fecha no primeiro `}, { onConflict` — o padrão usado em todo o arquivo.
    const fim = texto.indexOf('}, { onConflict', i);
    blocos.push(texto.slice(i, fim === -1 ? i + 2000 : fim));
    i = texto.indexOf(marca, i + marca.length);
  }
  return blocos;
}

describe('âncora do módulo-base no reset da demo', () => {
  const blocos = upsertsDeModulo(fonte);

  it('o reset realmente cria módulos-base (o guard não mede o nada)', () => {
    // Sem esta âncora, remover os upserts deixaria o teste verde por vacuidade.
    expect(blocos.length).toBeGreaterThanOrEqual(2);
  });

  it('`competencias` continua sendo apagada pelo reset (a premissa do guard)', () => {
    // Se um dia `competencias` deixar de ser limpa, a regra abaixo perde a
    // razão de ser — e é melhor revisitar do que carregar um guard órfão.
    expect(fonte).toMatch(/DEMO_RESET_TABLES[\s\S]*'competencias'/);
  });

  it('todo módulo ancora no catálogo global, com competencia_id nulo', () => {
    const violacoes = blocos.flatMap((bloco, indice) => {
      const problemas: string[] = [];
      if (!/competencia_base_id:\s*[^n]/.test(bloco)) {
        problemas.push(`upsert #${indice + 1}: sem competencia_base_id (ou nulo)`);
      }
      // `competencia_id` só pode ser null: qualquer id vem de `competencias`,
      // que o reset apaga.
      const comId = bloco.match(/competencia_id:\s*([^,\n]+)/);
      if (comId && comId[1].trim() !== 'null') {
        problemas.push(`upsert #${indice + 1}: competencia_id = ${comId[1].trim()} (só null é seguro)`);
      }
      return problemas;
    });
    expect(violacoes).toEqual([]);
  });
});
