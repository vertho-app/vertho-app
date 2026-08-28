const TARGET_RATE = 16000;
const SAMPLES_PER_PACKET = TARGET_RATE / 10;

class VerthoCopilotCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(SAMPLES_PER_PACKET * 2);
    this.written = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const system = input[0];
    const microphone = input[1] || new Float32Array(system.length);

    for (let index = 0; index < system.length; index += 1) {
      this.buffer[this.written * 2] = this.toInt16(system[index]);
      this.buffer[this.written * 2 + 1] = this.toInt16(microphone[index] || 0);
      this.written += 1;
      if (this.written === SAMPLES_PER_PACKET) {
        this.port.postMessage(this.buffer.slice(0));
        this.written = 0;
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
