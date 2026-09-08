// Pure PCM editing shared by the production desk and its tests.
export function editPCM(channels, sampleRate, { start = 0, end, gain = 0, fadeIn = 0, fadeOut = 0 }) {
  const duration = channels[0]?.length / sampleRate;
  end ??= duration;
  if (!channels.length || !Number.isFinite(duration) || ![start, end, gain, fadeIn, fadeOut].every(Number.isFinite) || start < 0 || end > duration + 0.001 || end <= start || gain < -60 || gain > 12 || fadeIn < 0 || fadeOut < 0) throw new Error('Choose a valid audio range and volume.');
  const first = Math.floor(start * sampleRate), last = Math.min(channels[0].length, Math.floor(end * sampleRate));
  const count = last - first;
  if (count < 1) throw new Error('The selected range is too short.');
  const level = 10 ** (gain / 20);
  return channels.map(channel => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const fade = Math.min(1, fadeIn ? i / (sampleRate * fadeIn) : 1, fadeOut ? (count - 1 - i) / (sampleRate * fadeOut) : 1);
      out[i] = Math.max(-1, Math.min(1, channel[first + i] * level * fade));
    }
    return out;
  });
}
export function wavBytes(channels, sampleRate) {
  const length = channels[0].length, n = channels.length;
  const data = new ArrayBuffer(44 + length * n * 2), view = new DataView(data);
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, n, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * n * 2, true);
  view.setUint16(32, n * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, length * n * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i++) for (const channel of channels) { const s = Math.max(-1, Math.min(1, channel[i])); view.setInt16(offset, Math.round(s * (s < 0 ? 32768 : 32767)), true); offset += 2; }
  return data;
}
