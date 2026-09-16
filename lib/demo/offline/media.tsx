import React from 'react';
import { Play } from 'lucide-react';
import { ENVIRONMENT } from './environment';
import { demo, notifyOnlineOnly } from './runtime';

export function BunnyVideoPlayer({ videoId, title, ...props }: any) {
  const media = demo.weeks.flatMap(w => w.formats).find(f => f.path === videoId);
  if (!media) return <button className="flex h-full w-full items-center justify-center gap-2 text-sm text-white/70" onClick={notifyOnlineOnly}><Play size={18} /> Este vídeo precisa da sala online</button>;
  return <video controls playsInline preload="metadata" className="h-full w-full" src={ENVIRONMENT.base+media.path} aria-label={title} />;
}
export function useBunnyTracking() {}
export async function fetchAuth() { notifyOnlineOnly(); return Response.json({ error: 'Esta ação precisa da sala online.' }, { status: 503 }); }
