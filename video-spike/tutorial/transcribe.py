"""Offline transcript with word timestamps; runs in the existing Whisper venv.

Only reads the supplied narration, not microphone/browser audio. Model must be
cached already. Output is a verification/alignment artifact, never new copy.
"""
import json
import hashlib
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
dll_handles = []
if sys.platform == 'win32':
    import nvidia
    for root in nvidia.__path__:
        for package in ('cublas', 'cudnn', 'cuda_nvrtc'):
            folder = str(Path(root) / package / 'bin')
            if os.path.isdir(folder):
                dll_handles.append(os.add_dll_directory(folder))
                os.environ['PATH'] = folder + os.pathsep + os.environ.get('PATH', '')

from faster_whisper import WhisperModel

model = WhisperModel('large-v3-turbo', device='cuda', compute_type='int8_float16', local_files_only=True)
for source in sys.argv[1:]:
    dest = Path(source).with_suffix('.words.json')
    if dest.exists():
        with dest.open(encoding='utf-8') as existing:
            cached = json.load(existing)
        with open(source, 'rb') as audio:
            source_hash = hashlib.file_digest(audio, 'sha256').hexdigest()
        if cached.get('sourceSha256') == source_hash:
            print('EXISTE', dest, flush=True)
            continue
        raise RuntimeError(f'Transcrição existente sem vínculo íntegro: {dest}; preserve-a e use outro nome de arquivo')
    segments, info = model.transcribe(source, language='pt', beam_size=5, word_timestamps=True, vad_filter=False)
    words = []
    for segment in segments:
        print(f'{segment.start:.2f}-{segment.end:.2f}: {segment.text}', flush=True)
        words.extend({'word': w.word, 'start': w.start, 'end': w.end, 'probability': w.probability} for w in segment.words)
    with open(source, 'rb') as audio:
        source_hash = hashlib.file_digest(audio, 'sha256').hexdigest()
    with dest.open('x', encoding='utf-8') as output:
        json.dump({'source': str(Path(source).resolve()), 'sourceSha256': source_hash, 'language': info.language, 'duration': info.duration, 'words': words}, output, ensure_ascii=False, indent=2)
    print('GRAVADO', dest, flush=True)
