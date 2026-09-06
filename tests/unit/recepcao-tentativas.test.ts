import { beforeEach, expect, test, vi } from 'vitest';
import { ErroReferenciaAvaliacao } from '@/lib/recepcao/core';
const mock=vi.hoisted(()=>({chat:vi.fn(),rows:[] as any[]}));
vi.mock('@/actions/ai-client',()=>({callAIChat:mock.chat}));
vi.mock('@/lib/ai-tasks',()=>({getModelForTask:async()=>'modelo-solicitado'}));
import {geradorRecepcao} from '@/lib/recepcao/gerador';
import {insumosExemplo} from './recepcao-fixtures.mjs';
beforeEach(()=>{mock.rows=[];mock.chat.mockReset().mockResolvedValue('{"fala":"Olá."}');});
const sb:any={from:()=>({insert:async r=>{mock.rows.push(structuredClone(r));return {error:null}},update:p=>{let id;const q={eq:(k,v)=>{if(k==='id')id=v;return q},then:resolve=>resolve({error:null,data:Object.assign(mock.rows.find(r=>r.id===id),p)})};return q}})};
const args={etapa:'paciente',system:'instruções reservadas',messages:[{role:'user' as const,content:'fala privada'}]};
test('tentativa é persistida antes do provedor e custo recebe seu identificador',async()=>{
 mock.chat.mockImplementation(async(...a)=>{expect(mock.rows).toHaveLength(1);expect(a[4].correlationId).toBe(mock.rows[0].id);return '{"fala":"Olá."}'});
 const ai=geradorRecepcao('empresa',null,true,{sb,sessaoId:'sessao',cenarioVersao:'1'});await ai.gerar(args);await ai.validar();
 expect(mock.rows[0].estado).toBe('aceita');expect(JSON.stringify(mock.rows)).not.toContain('instruções reservadas');expect(JSON.stringify(mock.rows)).not.toContain('fala privada');
});
test('JSON recusado permanece registrado mesmo sem commit de sessão',async()=>{
 mock.chat.mockResolvedValue('não é JSON');const ai=geradorRecepcao('empresa',null,true,{sb,sessaoId:'sessao',cenarioVersao:'1'});
 await expect(ai.gerar(args)).rejects.toThrow();expect(mock.rows[0].estado).toBe('rejeitada');expect(mock.rows[0].erro_codigo).toBe('json_invalido');
 expect(mock.chat).toHaveBeenCalledTimes(2);expect(mock.rows).toHaveLength(2);expect(mock.rows.every(r=>r.estado==='rejeitada')).toBe(true);
});

test('fala com JSON inválido é regenerada uma vez sem duplicar a mensagem',async()=>{
 mock.chat.mockResolvedValueOnce('{"fala":"Você disse "aguarde"?"}').mockResolvedValueOnce(JSON.stringify({fala:'Aguardar até quando?'}));
 const ai=geradorRecepcao('empresa',null,true,{sb,sessaoId:'sessao',cenarioVersao:'2'});
 expect(JSON.parse(await ai.gerar(args)).fala).toBe('Aguardar até quando?');await ai.validar();
 expect(mock.rows.map(r=>r.estado)).toEqual(['rejeitada','aceita']);expect(mock.rows[0].id).not.toBe(mock.rows[1].id);
 expect(mock.chat.mock.calls[1][1]).toEqual(args.messages);expect(mock.rows[0].prompt_hash).not.toBe(mock.rows[1].prompt_hash);
});

test('falha de rede da paciente não recebe retry de formato',async()=>{
 mock.chat.mockRejectedValue(new Error('timeout'));const ai=geradorRecepcao('empresa',null,true,{sb,sessaoId:'sessao',cenarioVersao:'2'});
 await expect(ai.gerar(args)).rejects.toThrow('timeout');expect(mock.chat).toHaveBeenCalledTimes(1);
});

test('metadados distinguem paciente negociável, persistente e avaliador',async()=>{
 const ai=geradorRecepcao('empresa',null,true,{sb,sessaoId:'sessao',cenarioVersao:'3.0'});
 await ai.gerar({...args,perfilPaciente:'negociavel'});await ai.validar();
 await ai.gerar({...args,perfilPaciente:'resistencia_persistente'});await ai.validar();
 mock.chat.mockResolvedValueOnce(JSON.stringify(insumosExemplo()));await ai.gerar({...args,etapa:'avaliador'});await ai.validar();
 expect(new Set(mock.rows.map(r=>r.prompt_versao)).size).toBe(3);
 expect(mock.rows[0].prompt_versao).toContain('negociavel');expect(mock.rows[1].prompt_versao).toContain('persistente');expect(mock.rows[2].prompt_versao).toContain('avaliador');
 expect(mock.rows.every(r=>r.cenario_versao==='3.0')).toBe(true);
});
test('erro de referência e tentativa seguinte aceita têm registros distintos',async()=>{
 const ai=geradorRecepcao('empresa',null,true,{sb,sessaoId:'sessao',cenarioVersao:'1'});
 await ai.gerar(args);await ai.validar(new ErroReferenciaAvaliacao('participante_incorreto','dimensoes.x.evidencias[0]','não logar'));
 await ai.gerar(args);await ai.validar();expect(mock.rows.map(r=>r.estado)).toEqual(['rejeitada','aceita']);expect(mock.rows[0].id).not.toBe(mock.rows[1].id);
});
