/** Revoice an archived published tutorial, preserving its screens and captions.
 * Requires a verified original timeline and the approved continuous take.
 * Each replacement is a NEW file. Does not upload, delete or edit references.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { FLOWS, type Cut } from './storyboard';
import { sha256, validarClipsTutorial, clipAtual, type TutorialAudioManifest } from './narration-config';
import { visualAnchors, setptsExpression } from './retime-core';
import type { AlignedStep } from './alignment';

const OUT = path.resolve(process.env.TUTORIAL_OUT_DIR || 'video-spike/tutorial/out');
const PUBLIC = path.resolve(process.env.TUTORIAL_PUBLIC_DIR || 'public/video-spike');
const flow = FLOWS[process.argv[2]], cut = process.argv[3] as Cut;
if (!flow || !['app','ajuda','full'].includes(cut)) throw new Error('Use retime.mts <flow> <cut>');
const original = JSON.parse(readFileSync(path.join(OUT, 'originais', `${flow.id}.${cut}.timeline.json`), 'utf8'));
const narration: TutorialAudioManifest = JSON.parse(readFileSync(path.join(OUT, `${flow.id}.audio.json`), 'utf8'));
const alignment = JSON.parse(readFileSync(path.join(OUT, `${flow.id}.alignment.json`), 'utf8'));
const chosen = flow.steps.filter(s => s.cuts.includes(cut));
const byId = validarClipsTutorial({ id: flow.id, steps: chosen }, narration);
if (alignment.sourceSha256 !== narration.source.sha256 || sha256(readFileSync(path.join(PUBLIC,narration.source.audio))) !== narration.source.sha256) throw new Error('Origem/alinhamento alterados após QA');
if (original.flow !== flow.id || original.cut !== cut || original.fps !== 30 || Math.abs(original.delta) > 0.15
  || sha256(readFileSync(original.media)) !== original.sha256) throw new Error('Original não corresponde à timeline validada');
if (original.steps.map((s:any) => s.id).join() !== chosen.map(s => s.id).join()
  || original.steps.some((s:any,i:number) => s.narration !== chosen[i].narration)) throw new Error('Roteiro mudou: não reutilize legendas antigas');
const fingerprint = sha256(JSON.stringify({ original:original.sha256, source:narration.source.sha256, alignment, clips:narration.clips, version:1 })).slice(0,12);
const folder = path.join(OUT,'renders',`${flow.id}-${cut}-${fingerprint}`);
mkdirSync(folder,{recursive:true});
const files:string[] = [], report:any[] = [];
const ff = (args:string[]) => execFileSync('ffmpeg',['-v','error','-nostdin',...args],{windowsHide:true,stdio:'pipe',maxBuffer:1024*1024*4});
const codec = ['-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','4'];
for (let i=0;i<chosen.length;i++) {
  const step=chosen[i], old=original.steps[i], clip=byId.get(step.id)!;
  const audio=path.join(PUBLIC,clip.audio);
  if(!clipAtual(clip,clip.key,readFileSync(audio))) throw new Error(`Fatia alterada: ${step.id}`);
  const lead = old.leadFrames/30, tail = flow.id==='boasvindas'?14/30:0.8;
  const frames = Math.round(lead*30)+Math.round(clip.seconds*30)+Math.round(tail*30);
  const duration=frames/30, oldDuration=old.durationInFrames/30;
  const row:AlignedStep=alignment.steps.find((s:AlignedStep)=>s.id===step.id);
  const anchors=visualAnchors({text:step.narration,cartela:step.kind==='cartela',oldSeconds:oldDuration,oldAudioSeconds:old.audioSeconds,newSeconds:duration,lead,sourceStart:clip.sourceStart,alignment:row});
  const dest=path.join(folder,`${String(i).padStart(2,'0')}-${step.id}.mp4`);
  if(!existsSync(dest)) {
    ff(['-ss',(old.fromFrame/30).toFixed(6),'-t',oldDuration.toFixed(6),'-i',original.media,'-i',audio,
      '-filter_complex',`[0:v]setpts=PTS-STARTPTS,setpts='${setptsExpression(anchors)}',fps=30,tpad=stop_mode=clone:stop_duration=1[v];[1:a]adelay=${Math.round(lead*1000)}:all=1,apad[a]`,
      '-map','[v]','-map','[a]',...codec,'-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t',duration.toFixed(6),'-movflags','+faststart','-n',dest]);
  }
  files.push(dest);report.push({id:step.id,frames,anchors,clipSha256:clip.sha256});
  console.log(`${flow.id}/${cut} ${i+1}/${chosen.length} ${step.id} ${duration.toFixed(2)}s`);
}
const outro=path.join(folder,'99-outro.mp4'), outroSeconds=(original.totalFrames-original.outroFromFrame)/30;
if(!existsSync(outro)) ff(['-ss',(original.outroFromFrame/30).toFixed(6),'-i',original.media,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-map','0:v','-map','1:a',...codec,'-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t',outroSeconds.toFixed(6),'-movflags','+faststart','-n',outro]);
files.push(outro);
const list=path.join(folder,'concat.txt');
writeFileSync(list,files.map(f=>`file '${f.replace(/\\/g,'/').replace(/'/g,"'\\''")}'`).join('\n'));
const final=path.join(folder,`tutorial-${flow.id}-${cut}-novo-tts.mp4`);
if(!existsSync(final)) ff(['-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart','-n',final]);
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',final],{encoding:'utf8',windowsHide:true}));
const expected=report.reduce((sum,r)=>sum+r.frames/30,0)+outroSeconds;
if(Math.abs(Number(probe.format.duration)-expected)>0.3 || !probe.streams.some((s:any)=>s.width===1920&&s.height===1080))throw new Error('Render não passou na validação de duração/Full HD');
writeFileSync(path.join(folder,'render.json'),JSON.stringify({flow:flow.id,cut,originalGuid:original.guid,originalSha256:original.sha256,sourceSha256:narration.source.sha256,qa:narration.source.qa,final,sha256:sha256(readFileSync(final)),expected,probe,steps:report},null,2));
console.log('PRÉVIA VALIDADA',final);
