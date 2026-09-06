import {test,expect} from 'vitest';
import {catalogoLimites} from '@/lib/recepcao/catalogo-limites';
import {catalogoDesafiador} from '@/lib/recepcao/catalogo-desafiador';
import {abrirSessao,promptPaciente,visaoPublica} from '@/lib/recepcao/core';
import {cenarioSchema} from '@/lib/recepcao/schema';

test.each(catalogoLimites)('$id: resistência persistente respeita schema, isolamento e versionamento',c=>{
 expect(cenarioSchema.safeParse(c).success).toBe(true);expect(c.versao).toBe('3.0');
 for(let v=0;v<2;v++){
  const s=abrirSessao(c,v),prompt=promptPaciente(s.cenario),publico=JSON.stringify(visaoPublica(s));
  expect(s.cenario.paciente.postura).toBe('resistencia_persistente');
  expect(prompt).toContain('RESISTÊNCIA PERSISTENTE');expect(prompt).not.toContain('Reduza a resistência quando');
  expect(publico).not.toContain('resistencia_persistente');expect(publico).not.toContain(s.cenario.paciente.comportamento);
 }
 const anterior=catalogoDesafiador.find(x=>x.id===c.id)!;
 expect(anterior.versao).toBe('2.0');expect(promptPaciente(anterior)).toContain('Reduza a resistência quando');
});
test('edição preserva a postura e permite voltar ao perfil negociável',()=>{
 const c=structuredClone(catalogoLimites[0]);
 expect(cenarioSchema.parse(c).paciente.postura).toBe('resistencia_persistente');
 c.paciente.postura='negociavel';expect(promptPaciente(cenarioSchema.parse(c))).not.toContain('RESISTÊNCIA PERSISTENTE');
});
