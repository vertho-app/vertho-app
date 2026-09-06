import { RECEPCAO_SESSAO } from '@/lib/status';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/request-context';
import { csrfCheck } from '@/lib/csrf';
import { aiLimiter } from '@/lib/rate-limit';
import { contextoRecepcao, RecepcaoError } from '@/lib/recepcao/access';
import { generateNarrationAudio } from '@/lib/gemini-tts';
import { gravarLinhaLedger } from '@/lib/ia-ledger';
import { textoParaTreino } from '@/lib/recepcao/ai';
import { comContexto } from '@/lib/execucao-contexto';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const resposta=(d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request) {
 return comContexto({runtime:'rota',orcamentoMs:300000,onde:'api/recepcao/voz'},async()=>{
  try {
   const csrf=csrfCheck(req);if(csrf) return csrf;
   const auth=await requireUser(req);if(auth instanceof Response)return auth;
   const q=new URL(req.url).searchParams,empresa=q.get('empresaId'),id=z.string().uuid().parse(q.get('sessaoId'));
   if(empresa) z.string().uuid().parse(empresa);
   const c=await contextoRecepcao(req,empresa,true,auth);if(c instanceof Response)return c;
   const limited=await aiLimiter.check(req,auth.email);if(limited)return limited;
   const {data:row,error}=await c.sb.from('recepcao_sessoes').select('*').eq('empresa_id',c.empresaId).eq('owner_key',c.ownerKey).eq('id',id).maybeSingle();
   if(error) throw new RecepcaoError(503,'Não foi possível consultar o treino.');
   if(!row) throw new RecepcaoError(404,'Treino não encontrado.');
   const acao=z.enum(['ouvir','transcrever']).parse(q.get('acao'));
   const mensagem=acao==='ouvir'?row.estado.historico.find(m=>m.id===q.get('mensagemId')&&m.role==='assistant'):null;
   if(acao==='ouvir'&&!mensagem) throw new RecepcaoError(400,'Selecione uma fala da paciente.');
   if(acao==='transcrever'&&row.estado.status!==RECEPCAO_SESSAO.EM_ANDAMENTO) throw new RecepcaoError(409,'O atendimento já foi encerrado.');
   let arquivo:File|null=null;
   if(acao==='transcrever') {
    // Teto aplicado antes de parsear multipart, inclusive sem Content-Length.
    const reader=req.body?.getReader();if(!reader)throw new RecepcaoError(400,'Áudio ausente.');
    const partes:Uint8Array[]=[];let bytes=0;
    while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>1200000){await reader.cancel();throw new RecepcaoError(413,'Grave uma resposta de até 60 segundos.')}partes.push(r.value)}
    const body=Buffer.concat(partes);
    const form=await new Response(body,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
    const f=form.get('audio');if(!(f instanceof File)||f.size<100||f.size>1100000||!/^audio\/(webm|mp4|ogg|mpeg|wav)(;.*)?$/.test(f.type))throw new RecepcaoError(400,'Formato de áudio inválido. Grave novamente.');
    arquivo=f;
   }
   const tentativa=randomUUID(),inicio=Date.now();let ok=false,erroCodigo='audio_indisponivel';
   try {
    const started=await c.sb.from('recepcao_tentativas').insert({id:tentativa,sessao_id:id,empresa_id:c.empresaId,etapa:acao==='ouvir'?'voz_paciente':'transcricao',cenario_versao:row.estado.cenario.versao,prompt_versao:'recepcao-voz-1.0'});
    if(started.error)throw new RecepcaoError(503,'Não foi possível registrar a operação de voz.');
    if(acao==='ouvir') {
     const audio=await generateNarrationAudio(mensagem.content,{voice:'Aoede',segmentar:false,style:'Leia somente o texto a seguir em português brasileiro, como uma pessoa conversando com a recepção. Não acrescente palavras.',ledger:{feature:'recepcao_voz',empresaId:c.empresaId,colaboradorId:row.colaborador_id,correlationId:tentativa}});
     ok=true;return new Response(new Uint8Array(audio.buffer),{headers:{'Content-Type':audio.contentType,'Cache-Control':'no-store'}});
    }
    if(!process.env.OPENAI_API_KEY)throw new RecepcaoError(503,'A transcrição não está disponível. Você pode escrever a resposta.');
    const form=new FormData();form.append('file',arquivo!,`resposta.${arquivo!.type.includes('mp4')?'mp4':arquivo!.type.includes('ogg')?'ogg':arquivo!.type.includes('wav')?'wav':arquivo!.type.includes('mpeg')?'mp3':'webm'}`);form.append('model','whisper-1');form.append('language','pt');form.append('response_format','verbose_json');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.timeout(45000)});
    if(!r.ok)throw new RecepcaoError(502,'Não foi possível transcrever. Você pode tentar novamente ou escrever.');
    const d=await r.json();
    const duracao=d.usage?.seconds??d.duration;
    const segundos=typeof duracao==='number'&&Number.isFinite(duracao)&&duracao>0?duracao:null;
    // Tarifa por minuto conferida em 05/09/2026: developers.openai.com/api/docs/models/whisper-1.
    await gravarLinhaLedger({feature:'recepcao_transcricao',empresa_id:c.empresaId,colaborador_id:row.colaborador_id,correlation_id:tentativa,provider:'openai',model:'whisper-1',input_tokens:0,output_tokens:0,cost_usd:segundos!==null?Math.ceil(segundos)*0.006/60:null,latency_ms:Date.now()-inicio,status:'ok',source:auth.isPlatformAdmin?'piloto':'wrapper',runtime:'rota',orcamento_ms:300000});
    if(segundos===null){erroCodigo='duracao_invalida';throw new RecepcaoError(502,'Não foi possível verificar a duração do áudio. Grave novamente ou escreva sua resposta.');}
    const texto=textoParaTreino(typeof d.text==='string'?d.text:'');
    if(!texto||texto.length>4000||segundos>65)throw new RecepcaoError(400,'A gravação ficou longa ou não teve fala reconhecida. Grave uma resposta mais curta.');
    ok=true;return resposta({texto});
   } finally {
    const done=await c.sb.from('recepcao_tentativas').update({estado:ok?'aceita':'rejeitada',erro_codigo:ok?null:erroCodigo,finished_at:new Date().toISOString(),duracao_ms:Date.now()-inicio}).eq('empresa_id',c.empresaId).eq('sessao_id',id).eq('id',tentativa);
    if(done.error)console.error('[recepcao] telemetria de áudio incompleta',{tentativa});

   }
  } catch(e) {
   if(e instanceof RecepcaoError)return resposta({error:e.message},e.status);
   if(e instanceof z.ZodError)return resposta({error:'Dados de áudio inválidos.'},400);
   console.error('[recepcao] falha de voz',e instanceof Error?e.name:'erro');return resposta({error:'O áudio está indisponível. Continue pelo texto.'},502);
  }
 });
}
