/** AudioWorklet: forwards mono input blocks to the main thread while recording. */
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = (e) => { this.on = e.data === 'start'; }; }
  process(inputs) {
    const ch = inputs[0]; if (this.on && ch && ch.length) {
      const n = ch[0].length, m = new Float32Array(n);
      for (let c = 0; c < ch.length; c++) for (let i = 0; i < n; i++) m[i] += ch[c][i] / ch.length;
      this.port.postMessage(m, [m.buffer]);
    }
    return true;
  }
}
registerProcessor('vc-capture', Capture);
