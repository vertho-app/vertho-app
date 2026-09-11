import type { LiveUtterance } from '@/lib/copiloto/types';

const TARGET_RATE = 16000;

export type CaptureState = 'parado' | 'conectando' | 'gravando' | 'erro';
export type CaptureSurface = 'browser' | 'window' | 'monitor' | 'unknown';
import { divergenciaDeSaida, type SaidaDeAudio } from '@/lib/copiloto/saida-de-audio';

export type CaptureAudioLevels = { system: number; microphone: number };

type SegmentPayload = {
  type: 'segmento' | 'parcial_texto';
  canal: 'cliente' | 'vendedor';
  texto: string;
};

type CaptureOptions = {
  url: string;
  onSegment: (payload: SegmentPayload) => void;
  onPartial?: (payload: SegmentPayload) => void;
  onLevels?: (levels: CaptureAudioLevels) => void;
  onSurface?: (surface: CaptureSurface) => void;
  /** O usuário parou o compartilhamento (barra do Chrome ou botão): o cliente some sem erro. */
  onSystemTrackEnded?: () => void;
  /** Tela inteira gravando um aparelho e a chamada tocando em outro. */
  onOutputMismatch?: (saida: SaidaDeAudio) => void;
  /** A transcrição está atrasada em relação à fala (fila do executor cheia). */
  onLag?: (atrasado: boolean) => void;
  /** O socket caiu no meio da reunião e voltou. */
  onReconnect?: (estado: 'perdido' | 'voltou' | 'desistiu') => void;
  onState: (state: CaptureState) => void;
  onError: (message: string) => void;
};

export class LocalMeetingCapture {
  private readonly options: CaptureOptions;
  /** Distingue socket caído de captura encerrada pela pessoa. */
  private parando = false;
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
      // A caixa de compartilhamento deve ser aberta enquanto o clique do usuário
      // ainda está ativo; uma espera de rede antes dela pode perder essa permissão.
      await this.openAudio();
      await this.connectAsr();
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
          // A transcrição não parou: o que parou foi a antecipação. Sem este
          // aviso, atraso de GPU parece travamento.
          if ((payload as any).type === 'atrasado') this.options.onLag?.(true);
          if ((payload as any).type === 'em_dia') this.options.onLag?.(false);
          if ((payload as any).type === 'erro') this.options.onError(payload.mensagem || 'Erro na transcrição local.');
        } catch {
          // Mensagem que não pertence ao protocolo do ASR: ignora.
        }
      };
      socket.onclose = () => {
        if (this.socket === socket) {
          this.socket = null;
          // A reunião continua acontecendo: o áudio segue capturado e o grafo
          // montado. Derrubar tudo porque o socket piscou custava a conversa
          // inteira, e o sidecar reinicia mais rápido do que a pessoa percebe.
          void this.reconectar();
        }
      };
    });
  }

  private async openAudio() {
    // `systemAudio` pertence ao nível superior de DisplayMediaStreamOptions.
    // `displaySurface: browser` apenas prioriza abas; o usuário ainda pode escolher
    // janela ou tela quando a reunião estiver em um aplicativo nativo.
    this.systemStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include',
      windowAudio: 'system',
      surfaceSwitching: 'include',
      selfBrowserSurface: 'exclude',
    } as any);
    if (!this.systemStream.getAudioTracks().length) throw new Error('NO_SYSTEM_AUDIO');

    // Sem isto, "Parar compartilhamento" na barra do Chrome deixava a reunião
    // muda do lado do cliente e a tela seguia dizendo que ouvia os dois.
    for (const track of this.systemStream.getAudioTracks()) {
      track.addEventListener('ended', () => this.options.onSystemTrackEnded?.(), { once: true });
    }

    const surface = this.systemStream.getVideoTracks()[0]?.getSettings().displaySurface;
    // Janela não carrega áudio no Chrome: a faixa vem e fica muda. Barrar aqui
    // troca 10 s de reunião perdida por uma mensagem antes de começar.
    if (surface === 'window') {
      this.systemStream.getTracks().forEach((track) => track.stop());
      this.systemStream = null;
      throw new Error('SURFACE_WINDOW');
    }
    this.options.onSurface?.(
      surface === 'browser' || surface === 'window' || surface === 'monitor' ? surface : 'unknown',
    );

    // O vídeo mantém a sessão de compartilhamento viva em implementações que
    // vinculam o áudio à superfície capturada. Ele nunca é exibido nem enviado.

    this.microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    // Só agora o navegador revela o NOME dos aparelhos: sem permissão de
    // microfone concedida, `enumerateDevices` devolve rótulo vazio e não há o
    // que comparar. Avisa, nunca barra — quem apontou o aplicativo da reunião
    // para o dispositivo padrão na mão continua com uma captura que funciona.
    if (surface === 'monitor') {
      try {
        const saida = divergenciaDeSaida(await navigator.mediaDevices.enumerateDevices());
        if (saida) this.options.onOutputMismatch?.(saida);
      } catch {
        // Enumerar é diagnóstico: falhar aqui não pode derrubar a captura.
      }
    }
  }

  private async buildGraph() {
    this.context = new AudioContext({ sampleRate: TARGET_RATE });
    await this.context.audioWorklet.addModule('/copiloto-capture-worklet.js?v=2');
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
      const data = event.data;
      if (data?.type === 'audio_levels') {
        this.options.onLevels?.({
          system: Number(data.system) || 0,
          microphone: Number(data.microphone) || 0,
        });
        return;
      }
      if (
        this.socket?.readyState === WebSocket.OPEN
        && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))
      ) {
        this.socket.send(data);
      }
    };
    merger.connect(this.worklet);
  }

  private translateError(error: any): string {
    if (error?.name === 'NotAllowedError') return 'Permissão negada para capturar a tela ou o microfone.';
    if (error?.message === 'ASR_TIMEOUT') return 'O Whisper local não respondeu em até 8 segundos.';
    if (error?.message === 'ASR_UNAVAILABLE') return `Não encontrei o Whisper local em ${this.options.url}.`;
    if (error?.message === 'NO_SYSTEM_AUDIO') return 'Compartilhe uma aba ou tela e marque “compartilhar áudio do sistema”.';
    if (error?.message === 'SURFACE_WINDOW') {
      return 'Você escolheu uma janela, e janela nunca carrega áudio no Chrome. '
        + 'Reunião no navegador: escolha a aba dela com “Compartilhar áudio da guia”. '
        + 'Reunião em aplicativo: escolha “Tela inteira” e marque “Compartilhar áudio do sistema”.';
    }
    return `Falha ao iniciar a captura: ${error?.message || 'erro desconhecido'}`;
  }

  /**
   * Reconecta com espera crescente, sem tocar na captura de áudio.
   *
   * Cinco tentativas em ~30 s: o sidecar sobe em poucos segundos quando é queda
   * do processo, e além disso o problema não é transitório. Cada tentativa
   * avisa a tela, porque um socket mudo é indistinguível de uma sala em
   * silêncio.
   */
  private async reconectar() {
    if (this.parando) return;
    this.options.onReconnect?.('perdido');
    const esperas = [500, 1500, 3000, 6000, 10000];
    for (const espera of esperas) {
      if (this.parando) return;
      await new Promise((resolve) => window.setTimeout(resolve, espera));
      if (this.parando) return;
      try {
        await this.connectAsr();
        this.options.onReconnect?.('voltou');
        return;
      } catch {
        // Próxima tentativa; o erro final é reportado depois do laço.
      }
    }
    this.options.onReconnect?.('desistiu');
    this.options.onError('A transcrição local caiu e não voltou. Reinicie a captura.');
    this.options.onState('erro');
  }

  stop() {
    this.parando = true;
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
