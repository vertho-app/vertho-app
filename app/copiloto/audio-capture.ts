import type { LiveUtterance } from '@/lib/copiloto/types';

const TARGET_RATE = 16000;

export type CaptureState = 'parado' | 'conectando' | 'gravando' | 'erro';

type SegmentPayload = {
  type: 'segmento' | 'parcial_texto';
  canal: 'cliente' | 'vendedor';
  texto: string;
};

type CaptureOptions = {
  url: string;
  onSegment: (payload: SegmentPayload) => void;
  onPartial?: (payload: SegmentPayload) => void;
  onState: (state: CaptureState) => void;
  onError: (message: string) => void;
};

export class LocalMeetingCapture {
  private readonly options: CaptureOptions;
  private context: AudioContext | null = null;
  private socket: WebSocket | null = null;
  private systemStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;

  constructor(options: CaptureOptions) {
    this.options = options;
  }

  async start() {
    this.options.onState('conectando');
    try {
      await this.connectAsr();
      await this.openAudio();
      await this.buildGraph();
      this.options.onState('gravando');
    } catch (error: any) {
      this.stop();
      this.options.onState('erro');
      this.options.onError(this.translateError(error));
      throw error;
    }
  }

  private async connectAsr() {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.options.url);
      socket.binaryType = 'arraybuffer';
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('ASR_TIMEOUT'));
      }, 8000);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        this.socket = socket;
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('ASR_UNAVAILABLE'));
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as SegmentPayload & { mensagem?: string };
          if (payload.type === 'segmento') this.options.onSegment(payload);
          if (payload.type === 'parcial_texto') this.options.onPartial?.(payload);
          if ((payload as any).type === 'erro') this.options.onError(payload.mensagem || 'Erro na transcrição local.');
        } catch {
          // Mensagem que não pertence ao protocolo do ASR: ignora.
        }
      };
      socket.onclose = () => {
        if (this.socket === socket) {
          this.socket = null;
          this.options.onError('A transcrição local foi interrompida. Reinicie a captura.');
          this.options.onState('erro');
        }
      };
    });
  }

  private async openAudio() {
    // Chrome exige vídeo no pedido para oferecer a caixa “compartilhar áudio”.
    this.systemStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { systemAudio: 'include', echoCancellation: false, noiseSuppression: false },
    } as any);
    if (!this.systemStream.getAudioTracks().length) throw new Error('NO_SYSTEM_AUDIO');
    this.systemStream.getVideoTracks().forEach((track) => track.stop());

    this.microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }

  private async buildGraph() {
    this.context = new AudioContext({ sampleRate: TARGET_RATE });
    await this.context.audioWorklet.addModule('/copiloto-capture-worklet.js');
    const system = this.context.createMediaStreamSource(this.systemStream!);
    const microphone = this.context.createMediaStreamSource(this.microphoneStream!);
    const merger = this.context.createChannelMerger(2);
    system.connect(merger, 0, 0);
    microphone.connect(merger, 0, 1);

    this.worklet = new AudioWorkletNode(this.context, 'vertho-copiloto-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    this.worklet.port.onmessage = (event) => {
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(event.data.buffer);
    };
    merger.connect(this.worklet);
  }

  private translateError(error: any): string {
    if (error?.name === 'NotAllowedError') return 'Permissão negada para capturar a tela ou o microfone.';
    if (error?.message === 'ASR_TIMEOUT') return 'O Whisper local não respondeu em até 8 segundos.';
    if (error?.message === 'ASR_UNAVAILABLE') return `Não encontrei o Whisper local em ${this.options.url}.`;
    if (error?.message === 'NO_SYSTEM_AUDIO') return 'Compartilhe uma aba ou tela e marque “compartilhar áudio do sistema”.';
    return `Falha ao iniciar a captura: ${error?.message || 'erro desconhecido'}`;
  }

  stop() {
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.worklet = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.systemStream?.getTracks().forEach((track) => track.stop());
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.systemStream = null;
    this.microphoneStream = null;
    void this.context?.close();
    this.context = null;
    this.options.onState('parado');
  }
}

export function toUtterance(payload: SegmentPayload): LiveUtterance {
  return { channel: payload.canal, text: payload.texto, at: Date.now() };
}
