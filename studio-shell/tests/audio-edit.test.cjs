const test = require('node:test');
const assert = require('node:assert/strict');
test('audio trims preserve source, apply gain and fades, and export stereo PCM WAV', async () => {
  const { editPCM, wavBytes } = await import('../../automation/studio/audio-edit.mjs');
  const input = new Float32Array(100).fill(0.5);
  const result = editPCM([input, input], 10, { start: 2, end: 6, gain: 6, fadeIn: 1, fadeOut: 1 });
  assert.equal(result[0].length, 40);
  assert.equal(input[0], 0.5);
  assert.equal(result[0][0], 0);
  assert.equal(result[0][39], 0);
  assert.ok(result[0][15] > 0.99 && result[0][15] <= 1);
  const bytes = wavBytes(result, 10), view = new DataView(bytes);
  assert.equal(Buffer.from(bytes).subarray(0,4).toString(), 'RIFF');
  assert.equal(view.getUint16(22,true), 2);
  assert.equal(view.getUint32(40,true), 40 * 2 * 2);
  assert.throws(() => editPCM([input],10,{start:8,end:2}), /valid audio range/);
  assert.throws(() => editPCM([input],10,{end:12}), /valid audio range/);
  assert.throws(() => editPCM([input],10,{gain:Infinity}), /valid audio range/);
});
