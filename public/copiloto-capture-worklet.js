const TARGET_RATE = 16000;
const SAMPLES_PER_PACKET = TARGET_RATE / 10;
const SAMPLES_PER_LEVEL_READING = TARGET_RATE / 2;

class VerthoCopilotCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(SAMPLES_PER_PACKET * 2);
    this.written = 0;
    this.levelSamples = 0;
    this.systemEnergy = 0;
    this.microphoneEnergy = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const system = input[0];
    const microphone = input[1];
    const frameCount = Math.max(system?.length || 0, microphone?.length || 0);
    if (!frameCount) return true;

    for (let index = 0; index < frameCount; index += 1) {
      const systemSample = system?.[index] || 0;
      const microphoneSample = microphone?.[index] || 0;
      this.buffer[this.written * 2] = this.toInt16(systemSample);
      this.buffer[this.written * 2 + 1] = this.toInt16(microphoneSample);
      this.written += 1;
      this.systemEnergy += systemSample * systemSample;
      this.microphoneEnergy += microphoneSample * microphoneSample;
      this.levelSamples += 1;

      if (this.written === SAMPLES_PER_PACKET) {
        this.port.postMessage(this.buffer.slice(0));
        this.written = 0;
      }

      if (this.levelSamples === SAMPLES_PER_LEVEL_READING) {
        this.port.postMessage({
          type: 'audio_levels',
          system: Math.sqrt(this.systemEnergy / this.levelSamples),
          microphone: Math.sqrt(this.microphoneEnergy / this.levelSamples),
        });
        this.levelSamples = 0;
        this.systemEnergy = 0;
        this.microphoneEnergy = 0;
      }
    }
    return true;
  }

  toInt16(sample) {
    const limited = Math.max(-1, Math.min(1, sample || 0));
    return limited < 0 ? limited * 0x8000 : limited * 0x7fff;
  }
}

registerProcessor('vertho-copiloto-capture', VerthoCopilotCapture);
