import { expect, test, vi } from 'vitest';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { cenarioSchema } from '@/lib/recepcao/schema';
import { abrirSessao, validarFala, visaoPublica, consolidar, encerrar, ErroReferenciaAvaliacao } from '@/lib/recepcao/core';
import { executarExemplo, insumosExemplo } from './recepcao-fixtures.mjs';
import { resumirEquipe } from '@/lib/recepcao/equipe';
vi.mock('@/lib/permissions',()=>({can:async()=>true}));

test('cinco casos curados e suas variantes preservam os contratos de cenário e privacidade',()=>{
 expect(catalogoInicial).toHaveLength(5);
 for(const c of catalogoInicial) {
  expect(cenarioSchema.safeParse(c).success).toBe(true);
  for(let i=0;i<1+c.variantes.length;i++){
   const s=abrirSessao(c,i),p=visaoPublica(s);
   expect(s.variante).toBe(i);expect(s.cenario.variantes).toEqual([]);
   expect(p.cenario.nomePaciente).toBe([c.paciente,...c.variantes][i].nome);
   expect(JSON.stringify(p)).not.toContain('comportamento');expect((p.cenario as any).rubrica).toBeUndefined();
  }
 }
});
test('quantidade de competências é flexível, pesos e identificadores continuam validados',()=>{
 const c=structuredClone(catalogoInicial[0]);c.rubrica=c.rubrica.slice(0,3);c.rubrica[0].peso=40;c.rubrica[1].peso=30;c.rubrica[2].peso=30;
 expect(cenarioSchema.safeParse(c).success).toBe(true);expect(abrirSessao(c).cenario.rubrica).toHaveLength(3);
 c.rubrica[1].id=c.rubrica[0].id;expect(cenarioSchema.safeParse(c).success).toBe(false);
 c.rubrica.pop();expect(cenarioSchema.safeParse(c).success).toBe(false);
});
test('fatos podem ser revelados, instruções reservadas evidentes são bloqueadas',()=>{
 const c=catalogoInicial[0];expect(()=>validarFala('Prefiro manter a Dra. Helena.',c)).not.toThrow();
 for(const fala of ['PERSONAGEM RESERVADO: paciente',c.paciente.limites])expect(()=>validarFala(fala,c)).toThrow('Exposição');
});
test('cada rejeição e recuperação é observável sem aceitar referência de outra pessoa',async()=>{
 const s=await executarExemplo();s.status='em_andamento';s.relatorio=null;
 const invalido=insumosExemplo();invalido.dimensoes[0].evidencias=[{mensagemId:'m0',trecho:s.historico[0].content}];
 const gerar=vi.fn().mockResolvedValueOnce(JSON.stringify(invalido)).mockResolvedValueOnce(JSON.stringify(insumosExemplo()));
 const registrar=vi.fn();await encerrar(s,gerar,registrar);
 expect(registrar).toHaveBeenCalledTimes(2);expect(registrar.mock.calls[0][0]).toBeInstanceOf(ErroReferenciaAvaliacao);expect(registrar.mock.calls[1]).toEqual([]);
});
test('indicadores não misturam casos, versões nem cobertura e usam a última revisão',async()=>{
 const s=await executarExemplo();const outro=structuredClone(s);outro.cenario.id='outro-caso';
 const parcial=structuredClone(s);parcial.relatorio.coberturaPercentual=75;
 const rows=[s,outro,parcial].map((estado,i)=>({id:String(i),estado,colaborador_id:'c',created_at:'2026-09-05'}));
 const resumo=resumirEquipe(rows,[{id:'c',nome_completo:'Pessoa',ativo:true}],[{sessao_id:'0',parecer:'discordo'},{sessao_id:'0',parecer:'concordo'}]);
 expect(resumo.grupos).toHaveLength(3);expect(resumo.pendentes).toBe(2);expect(resumo.sessoes[0].revisao).toBe('discordo');
});
test('rubrica do snapshot continua sendo a autoridade para a saída flexível da IA',async()=>{
 const s=await executarExemplo(),a=insumosExemplo();a.dimensoes[0].id='competencia_inventada';expect(()=>consolidar(s,a)).toThrow('ausente');
});
