import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('worklet de captura estéreo do Copiloto', () => {
  it('mantém reunião no canal 0, microfone no canal 1 e mede ambos', () => {
    let RegisteredProcessor: any;

    class FakeAudioWorkletProcessor {
      port = {
        messages: [] as unknown[],
        postMessage: (message: unknown) => this.port.messages.push(message),
      };
    }

    runInNewContext(
      readFileSync('public/copiloto-capture-worklet.js', 'utf8'),
      {
        AudioWorkletProcessor: FakeAudioWorkletProcessor,
        registerProcessor: (_name: string, processor: any) => { RegisteredProcessor = processor; },
        Int16Array,
        Math,
      },
    );

    const worklet = new RegisteredProcessor() as FakeAudioWorkletProcessor & {
      process: (inputs: Float32Array[][]) => boolean;
    };
    const system = new Float32Array(8_000).fill(0.1);
    const microphone = new Float32Array(8_000).fill(0.2);

    expect(worklet.process([[system, microphone]])).toBe(true);

    const packets = worklet.port.messages.filter((message) => ArrayBuffer.isView(message)) as Int16Array[];
    const levels = worklet.port.messages.find((message: any) => message?.type === 'audio_levels') as any;
    expect(packets).toHaveLength(5);
    expect([...packets[0].slice(0, 4)]).toEqual([3276, 6553, 3276, 6553]);
    expect(levels.system).toBeCloseTo(0.1, 4);
    expect(levels.microphone).toBeCloseTo(0.2, 4);
  });
});
