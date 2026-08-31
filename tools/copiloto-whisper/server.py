"""
Sidecar de transcricao local para o Copiloto Vertho.

O audio NUNCA sai desta maquina: o navegador captura microfone + audio do sistema,
manda PCM cru por WebSocket, e este processo transcreve na GPU com faster-whisper.

Protocolo
---------
Cliente -> servidor (binario):
    PCM Int16 little-endian, 16 kHz, 2 canais INTERCALADOS.
    canal 0 (L) = audio do sistema  -> quem fala e o CLIENTE
    canal 1 (R) = microfone         -> quem fala e o VENDEDOR

Cliente -> servidor (texto JSON):
    {"type": "reset"}   descarta buffers e contexto (nova reuniao)
    {"type": "ping"}

Servidor -> cliente (texto JSON):
    {"type": "ready",   "modelo": "...", "device": "cuda"}
    {"type": "parcial", "canal": "cliente|vendedor"}          fala em curso
    {"type": "segmento","canal": "...", "texto": "...", "inicio_ms": 0, "fim_ms": 0}
    {"type": "erro",    "mensagem": "..."}
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

TAXA_AMOSTRAGEM = 16_000
CANAIS = ("cliente", "vendedor")

# Um segmento e fechado quando o falante fica em silencio por este tempo.
SILENCIO_PARA_FECHAR_MS = 700
# Fala continua mais longa que isto e cortada a forca (nao adianta esperar quem nao para).
FALA_MAXIMA_MS = 15_000
# Abaixo disto e ruido, nao vale chamar o modelo.
FALA_MINIMA_MS = 400
# Quanto do texto anterior volta como contexto para o proximo segmento do mesmo canal.
CONTEXTO_MAX_CHARS = 200

# Transcricao parcial: le a fala pela metade para o copiloto comecar a pensar antes
# do ponto final. So compensa depois que ha conteudo suficiente para mudar a leitura.
PARCIAL_APOS_MS = 2_500
PARCIAL_INTERVALO_MS = 1_500

HOST = os.environ.get("ASR_HOST", "127.0.0.1")
PORTA = int(os.environ.get("ASR_PORT", "8765"))
MODELO = os.environ.get("ASR_MODEL", "large-v3-turbo")
IDIOMA = os.environ.get("ASR_LANG", "pt")
INATIVIDADE_ENCERRA_SEGUNDOS = int(os.environ.get("ASR_IDLE_EXIT_SECONDS", "0"))
ORIGENS_PERMITIDAS = [
    origem.strip()
    for origem in os.environ.get(
        "ASR_ALLOWED_ORIGINS",
        "https://app.vertho.ai,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origem.strip()
]
ORIGENS_PERMITIDAS.append(None)

conexoes_ativas = 0
ultima_atividade = time.monotonic()


def marcar_atividade() -> None:
    global ultima_atividade
    ultima_atividade = time.monotonic()


def ms_para_amostras(ms: int) -> int:
    return int(TAXA_AMOSTRAGEM * ms / 1000)


def amostras_para_ms(n: int) -> int:
    return int(n * 1000 / TAXA_AMOSTRAGEM)


class DetectorDeFala:
    """
    VAD por energia com piso de ruido adaptativo.

    Um limiar fixo funciona na mesa do desenvolvedor e falha na sala do cliente.
    O piso acompanha o ruido ambiente de cada canal (ar-condicionado, fone, sala),
    e fala e o que passa com folga desse piso.
    """

    LIMIAR_ABSOLUTO = 0.004
    FATOR_ACIMA_DO_PISO = 3.0

    def __init__(self) -> None:
        self.piso = 0.002

    def eh_fala(self, bloco: np.ndarray) -> bool:
        if bloco.size == 0:
            return False
        rms = float(np.sqrt(np.mean(np.square(bloco), dtype=np.float64)))
        limiar = max(self.LIMIAR_ABSOLUTO, self.piso * self.FATOR_ACIMA_DO_PISO)
        if rms < limiar:
            # So o silencio atualiza o piso, senao a propria fala eleva o limiar.
            self.piso = 0.95 * self.piso + 0.05 * rms
        return rms >= limiar


@dataclass
class BufferDeCanal:
    """Acumula o audio de um canal e decide quando ha um segmento pronto."""

    nome: str
    detector: DetectorDeFala = field(default_factory=DetectorDeFala)
    amostras: list[np.ndarray] = field(default_factory=list)
    total_amostras: int = 0
    silencio_amostras: int = 0
    falando: bool = False
    offset_ms: int = 0
    contexto: str = ""
    amostras_no_ultimo_parcial: int = 0
    parcial_em_voo: bool = False

    def deve_emitir_parcial(self) -> bool:
        """
        Vale transcrever o que ja foi dito, sem esperar a pessoa terminar?

        Ler a fala pela metade e o que permite comecar a pensar na sugestao antes do
        ponto final. So a partir de PARCIAL_APOS_MS: antes disso nao ha conteudo que
        mude a leitura, e transcrever cedo demais so ocupa a GPU.
        """
        if not self.falando or self.parcial_em_voo:
            return False
        if self.total_amostras < ms_para_amostras(PARCIAL_APOS_MS):
            return False
        novas = self.total_amostras - self.amostras_no_ultimo_parcial
        return novas >= ms_para_amostras(PARCIAL_INTERVALO_MS)

    def audio_parcial(self) -> np.ndarray:
        self.amostras_no_ultimo_parcial = self.total_amostras
        return np.concatenate(self.amostras)

    def acumular(self, bloco: np.ndarray) -> np.ndarray | None:
        """Recebe um bloco do canal. Devolve o audio do segmento quando ele fecha."""
        tem_fala = self.detector.eh_fala(bloco)

        if not self.falando:
            if not tem_fala:
                self.offset_ms += amostras_para_ms(bloco.size)
                return None
            self.falando = True

        self.amostras.append(bloco)
        self.total_amostras += bloco.size
        self.silencio_amostras = 0 if tem_fala else self.silencio_amostras + bloco.size

        fechou_por_silencio = self.silencio_amostras >= ms_para_amostras(SILENCIO_PARA_FECHAR_MS)
        fechou_por_tamanho = self.total_amostras >= ms_para_amostras(FALA_MAXIMA_MS)
        if not (fechou_por_silencio or fechou_por_tamanho):
            return None

        return self.fechar()

    def fechar(self) -> np.ndarray | None:
        if not self.amostras:
            self.reiniciar_fala()
            return None

        audio = np.concatenate(self.amostras)
        duracao_util = self.total_amostras - self.silencio_amostras
        self.reiniciar_fala()

        if duracao_util < ms_para_amostras(FALA_MINIMA_MS):
            self.offset_ms += amostras_para_ms(audio.size)
            return None
        return audio

    def reiniciar_fala(self) -> None:
        self.amostras = []
        self.total_amostras = 0
        self.silencio_amostras = 0
        self.falando = False
        self.amostras_no_ultimo_parcial = 0

    def limpar(self) -> None:
        self.reiniciar_fala()
        self.offset_ms = 0
        self.contexto = ""
        self.detector = DetectorDeFala()


def registrar_dlls_cuda() -> None:
    """
    Poe as DLLs de CUDA instaladas via pip no caminho de busca do processo.

    Sem isto, no Windows, o modelo carrega em 'cuda' sem reclamar e so falha na
    PRIMEIRA transcricao, com "cublas64_12.dll is not found" - um erro que chega
    tarde demais para o fallback de device ajudar.
    """
    if sys.platform != "win32":
        return
    try:
        import nvidia
    except ImportError:
        return

    # 'nvidia' e namespace package: __file__ e None, o caminho vem de __path__.
    for raiz in list(getattr(nvidia, "__path__", [])):
        for pacote in ("cublas", "cudnn", "cuda_nvrtc"):
            pasta = os.path.join(raiz, pacote, "bin")
            if os.path.isdir(pasta):
                os.add_dll_directory(pasta)
                os.environ["PATH"] = pasta + os.pathsep + os.environ.get("PATH", "")


class MotorDeTranscricao:
    def __init__(self) -> None:
        self.modelo = None
        self.device = "cpu"
        self.nome_modelo = MODELO

    def carregar(self) -> None:
        registrar_dlls_cuda()
        from faster_whisper import WhisperModel

        tentativas = [
            (MODELO, "cuda", "int8_float16"),
            (MODELO, "cpu", "int8"),
            ("small", "cpu", "int8"),
        ]
        ultimo_erro: Exception | None = None
        for nome, device, precisao in tentativas:
            try:
                print(f"[asr] carregando {nome} em {device} ({precisao})...", flush=True)
                modelo = WhisperModel(nome, device=device, compute_type=precisao)
                # Carregar nao prova nada: as DLLs de CUDA so sao exigidas no primeiro
                # forward. Sem esta transcricao de teste, um device quebrado passa pelo
                # fallback e derruba a reuniao inteira no primeiro segmento real.
                list(modelo.transcribe(np.zeros(TAXA_AMOSTRAGEM // 2, dtype=np.float32))[0])
                self.modelo = modelo
                self.device = device
                self.nome_modelo = nome
                print(f"[asr] pronto: {nome} / {device}", flush=True)
                return
            except Exception as erro:  # noqa: BLE001 - queremos mesmo cair para o proximo
                ultimo_erro = erro
                print(f"[asr] falhou {nome}/{device}: {erro}", flush=True)
        raise RuntimeError(f"nao foi possivel carregar nenhum modelo de ASR: {ultimo_erro}")

    def transcrever(self, audio: np.ndarray, contexto: str) -> str:
        segmentos, _info = self.modelo.transcribe(
            audio,
            language=IDIOMA,
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt=contexto or None,
        )
        return " ".join(s.text.strip() for s in segmentos).strip()


motor = MotorDeTranscricao()
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="asr")


async def atender(conexao) -> None:
    global conexoes_ativas
    conexoes_ativas += 1
    marcar_atividade()
    buffers = {nome: BufferDeCanal(nome=nome) for nome in CANAIS}
    envio = asyncio.Lock()

    async def responder(payload: dict) -> None:
        async with envio:
            await conexao.send(json.dumps(payload, ensure_ascii=False))

    async def processar_segmento(nome: str, audio: np.ndarray, inicio_ms: int) -> None:
        buffer = buffers[nome]
        laco = asyncio.get_running_loop()
        comeco = time.perf_counter()
        try:
            texto = await laco.run_in_executor(executor, motor.transcrever, audio, buffer.contexto)
        except Exception as erro:  # noqa: BLE001
            await responder({"type": "erro", "mensagem": f"falha ao transcrever: {erro}"})
            return

        if not texto:
            return

        buffer.contexto = (buffer.contexto + " " + texto)[-CONTEXTO_MAX_CHARS:].strip()
        await responder(
            {
                "type": "segmento",
                "canal": nome,
                "texto": texto,
                "inicio_ms": inicio_ms,
                "fim_ms": inicio_ms + amostras_para_ms(audio.size),
                "latencia_ms": int((time.perf_counter() - comeco) * 1000),
            }
        )

    async def processar_parcial(nome: str, audio: np.ndarray) -> None:
        buffer = buffers[nome]
        laco = asyncio.get_running_loop()
        try:
            texto = await laco.run_in_executor(executor, motor.transcrever, audio, buffer.contexto)
        except Exception:  # noqa: BLE001 - parcial e best-effort, o final ainda vem
            return
        finally:
            buffer.parcial_em_voo = False

        # A fala pode ter fechado enquanto isto rodava: ai o final ja foi (ou vai)
        # e mandar o parcial depois so faria o painel voltar no tempo.
        if texto and buffer.falando:
            await responder({"type": "parcial_texto", "canal": nome, "texto": texto})

    try:
        await responder({"type": "ready", "modelo": motor.nome_modelo, "device": motor.device})
        print("[asr] cliente conectado", flush=True)
        async for mensagem in conexao:
            marcar_atividade()
            if isinstance(mensagem, str):
                try:
                    comando = json.loads(mensagem)
                except json.JSONDecodeError:
                    continue
                if comando.get("type") == "reset":
                    for buffer in buffers.values():
                        buffer.limpar()
                    print("[asr] buffers reiniciados", flush=True)
                continue

            intercalado = np.frombuffer(mensagem, dtype=np.int16)
            if intercalado.size < 2:
                continue
            if intercalado.size % 2 == 1:
                intercalado = intercalado[:-1]

            quadros = intercalado.reshape(-1, 2).astype(np.float32) / 32768.0

            for indice, nome in enumerate(CANAIS):
                buffer = buffers[nome]
                estava_falando = buffer.falando
                inicio_ms = buffer.offset_ms
                audio = buffer.acumular(np.ascontiguousarray(quadros[:, indice]))

                if buffer.falando and not estava_falando:
                    await responder({"type": "parcial", "canal": nome})

                if audio is not None:
                    buffer.offset_ms = inicio_ms + amostras_para_ms(audio.size)
                    asyncio.create_task(processar_segmento(nome, audio, inicio_ms))
                elif buffer.deve_emitir_parcial():
                    buffer.parcial_em_voo = True
                    asyncio.create_task(processar_parcial(nome, buffer.audio_parcial()))

    except websockets.ConnectionClosed:
        pass
    finally:
        conexoes_ativas = max(0, conexoes_ativas - 1)
        marcar_atividade()
        print("[asr] cliente desconectado", flush=True)


async def aguardar_inatividade() -> None:
    if INATIVIDADE_ENCERRA_SEGUNDOS <= 0:
        await asyncio.Future()

    intervalo = min(5, max(1, INATIVIDADE_ENCERRA_SEGUNDOS // 10))
    while True:
        await asyncio.sleep(intervalo)
        inativo_por = time.monotonic() - ultima_atividade
        if conexoes_ativas == 0 and inativo_por >= INATIVIDADE_ENCERRA_SEGUNDOS:
            print(
                f"[asr] encerrando apos {INATIVIDADE_ENCERRA_SEGUNDOS}s sem cliente",
                flush=True,
            )
            return


async def principal() -> None:
    motor.carregar()
    async with websockets.serve(
        atender,
        HOST,
        PORTA,
        max_size=8 * 1024 * 1024,
        origins=ORIGENS_PERMITIDAS,
    ):
        marcar_atividade()
        print(f"[asr] escutando em ws://{HOST}:{PORTA}", flush=True)
        if INATIVIDADE_ENCERRA_SEGUNDOS > 0:
            print(
                f"[asr] desligamento automatico: {INATIVIDADE_ENCERRA_SEGUNDOS}s sem cliente",
                flush=True,
            )
        await aguardar_inatividade()


if __name__ == "__main__":
    try:
        asyncio.run(principal())
    except KeyboardInterrupt:
        print("\n[asr] encerrado", flush=True)
