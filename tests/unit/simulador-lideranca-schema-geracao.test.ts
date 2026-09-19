import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { schemaAvaliadorDoEncontro } from '@/lib/simulador-lideranca/schema';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import { linhasDoEncontro } from '@/lib/simulador-lideranca/avaliacao';
describe('schema de geração do encontro', () => {
 it.each(['lider','futuro'] as const)('%s: exige os 18 descritores mesmo sem oportunidade', (variante) => {
  for(let indice=0;indice<5;indice++){
   const codigos=linhasDoEncontro(linhasDaVariante(variante),indice).map(l=>l.cod_desc);
   const schema=schemaAvaliadorDoEncontro(codigos);
   const valor={sintese:'Síntese',proximaPratica:'Pratique',descritores:codigos.map(codigo=>({codigo,nivel:null,justificativa:'Sem oportunidade',evidencias:[]}))};
   expect(schema.safeParse(valor).success).toBe(true);
   expect(schema.safeParse({...valor,descritores:valor.descritores.slice(1)}).success).toBe(false);
   expect(schema.safeParse({...valor,descritores:valor.descritores.map((d,i)=>i?d:{...d,codigo:'OUTRO'})}).success).toBe(false);
   const json=z.toJSONSchema(schema) as any;
   expect(json.properties.descritores).toMatchObject({minItems:18,maxItems:18});
  }
 });
});
