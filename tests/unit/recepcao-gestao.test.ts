import { beforeEach, expect, test, vi } from 'vitest';
const permissions=vi.hoisted(()=>({allow:true}));
vi.mock('@/lib/permissions',()=>({can:async()=>permissions.allow}));
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { abrirSessao } from '@/lib/recepcao/core';
import { editarCenario, catalogo, cenarioPublicado } from '@/lib/recepcao/cenarios';
import { pessoasDaEquipe, sessaoDaEquipe, revisar } from '@/lib/recepcao/equipe';
let tables:Record<string,any[]>,c:any;
function banco(){return {from(table:string){const filters:any[]=[];let payload:any,op='select',first=false,duplicate=false;const execute=()=>{
 const lista=tables[table]||=[];let result=lista.filter(r=>filters.every(f=>f(r)));
 if(op==='insert') {if(lista.some(r=>r.id===payload.id))duplicate=true;else{lista.push({...structuredClone(payload),revisao:0,estado:payload.estado||'rascunho'});result=[lista.at(-1)]}}
 if(op==='update') result.forEach(r=>Object.assign(r,structuredClone(payload)));
 return {data:structuredClone(first?result[0]||null:result),error:duplicate?{code:'23505'}:null};};
 const q:any={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},or:s=>{const empresa=s.match(/empresa_id.eq.([^,]+)/)[1];filters.push(r=>r.empresa_id===empresa||r.empresa_id===null);return q},in:(k,vs)=>{filters.push(r=>vs.includes(r[k]));return q},order:()=>q,limit:()=>q,range:()=>Promise.resolve(execute()),insert:v=>{op='insert';payload=v;return q},update:v=>{op='update';payload=v;return q},single:()=>{first=true;return Promise.resolve(execute())},maybeSingle:()=>{first=true;return Promise.resolve(execute())},then:resolve=>resolve(execute())};return q;}}}
beforeEach(()=>{
 permissions.allow=true;
 const estado=abrirSessao(catalogoInicial[0]);estado.status='concluida';
 tables={colaboradores:[{id:'pessoa',empresa_id:'empresa',nome_completo:'Pessoa',gestor_email:'gestora@example.test'},{id:'vizinha',empresa_id:'empresa',gestor_email:'outra@example.test'}],recepcao_sessoes:[{id:'sessao',empresa_id:'empresa',owner_key:'colab:pessoa',colaborador_id:'pessoa',estado},{id:'fora',empresa_id:'empresa',colaborador_id:'vizinha',estado}],recepcao_revisoes:[],recepcao_cenarios:[{id:'global',empresa_id:null,codigo:'remarcacao-02',estado:'publicado',conteudo:structuredClone(catalogoInicial[0]),revisao:0,versao:'1'},{id:'privado',empresa_id:'outra',estado:'publicado',conteudo:structuredClone(catalogoInicial[0])},{id:'draft',empresa_id:'empresa',estado:'rascunho',conteudo:structuredClone(catalogoInicial[0]),revisao:0,versao:'2'}]};
 c={empresaId:'empresa',ownerKey:'colab:gestora',owner:'gestora@example.test',sb:banco(),auth:{role:'gestor',empresaId:'empresa',isPlatformAdmin:false,colaborador:{id:'gestora',empresa_id:'empresa',email:'gestora@example.test',nome_completo:'Gestora'}}};
});
test('gestora só lê liderados reais, mesmo dentro da mesma clínica',async()=>{expect((await pessoasDaEquipe(c)).map(p=>p.id)).toEqual(['pessoa']);await expect(sessaoDaEquipe(c,'fora')).rejects.toThrow('não encontrado');expect((await sessaoDaEquipe(c,'sessao')).id).toBe('sessao')});
test('colaborador sem papel de acompanhamento não abre painel',async()=>{c.auth.role='colaborador';await expect(pessoasDaEquipe(c)).rejects.toThrow('não permite')});
test('outro tenant não pode ser lido nem revisado',async()=>{c.empresaId='outra';c.auth.empresaId='outra';await expect(sessaoDaEquipe(c,'sessao')).rejects.toThrow('não encontrado')});
test('revisão é aditiva, idempotente e nunca altera o relatório',async()=>{const antes=structuredClone(tables.recepcao_sessoes);const cmd:any={sessaoId:'sessao',requestId:'req',parecer:'discordo',motivo:'A evidência não sustenta a nota.',dimensoes:['acolhimento']};await revisar(c,cmd);await revisar(c,cmd);expect(tables.recepcao_revisoes).toHaveLength(1);expect(tables.recepcao_sessoes).toEqual(antes);await expect(revisar(c,{...cmd,motivo:'Outro parecer'})).rejects.toThrow('outra revisão');});
test('autorrevisão e dimensão alheia ao caso são recusadas',async()=>{const cmd:any={sessaoId:'sessao',requestId:'req',parecer:'concordo',motivo:'Revisado.',dimensoes:['inventada']};await expect(revisar(c,cmd)).rejects.toThrow('Competência');c.ownerKey='colab:pessoa';await expect(revisar(c,{...cmd,dimensoes:[]})).rejects.toThrow('outra pessoa')});
test('catálogo de treino não expõe instruções e exclui rascunhos e outra clínica',async()=>{const r=await catalogo(c);expect(r).toHaveLength(1);expect(r[0].id).toBe('global');expect(JSON.stringify(r)).not.toContain('comportamento');await expect(cenarioPublicado(c,'privado')).rejects.toThrow('não está disponível')});

test('início sem cenário aceita outro caso publicado quando remarcação foi arquivada',async()=>{
 tables.recepcao_cenarios[0].estado='arquivado';tables.recepcao_cenarios.push({id:'outro-caso',empresa_id:'empresa',codigo:'primeira-consulta',estado:'publicado',conteudo:structuredClone(catalogoInicial[2])});
 expect((await cenarioPublicado(c)).id).toBe('outro-caso');await expect(cenarioPublicado(c,'global')).rejects.toThrow('não está disponível');
 tables.recepcao_cenarios.at(-1).estado='arquivado';await expect(cenarioPublicado(c)).rejects.toThrow('não está disponível');
});
test('publicação exige versão própria e revisão atual; caso global só pode ser copiado',async()=>{await expect(editarCenario(c,{acao:'publicar',id:'global',revisao:0})).rejects.toThrow('cópia');await expect(editarCenario(c,{acao:'publicar',id:'draft',revisao:9})).rejects.toThrow('mudou');const r=await editarCenario(c,{acao:'publicar',id:'draft',revisao:0});expect(r.estado).toBe('publicado');await expect(editarCenario(c,{acao:'salvar',id:'draft',revisao:1,conteudo:catalogoInicial[0]})).rejects.toThrow('nova versão')});
test('bloqueio de permissão também vale para gravar cenário e revisão',async()=>{permissions.allow=false;await expect(editarCenario(c,{acao:'salvar',conteudo:catalogoInicial[0]})).rejects.toThrow('permite');await expect(revisar(c,{sessaoId:'sessao',requestId:'req',parecer:'concordo',motivo:'Revisado.',dimensoes:[]})).rejects.toThrow('permite')});
