const SAMPLE_COUNT = 200;

export function computeWaveform(channelData: Float32Array, samples = SAMPLE_COUNT): number[] {
  const blockSize = Math.max(1, Math.floor(channelData.length / samples));
  const values: number[] = [];

  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(channelData[i * blockSize + j] ?? 0);
    }
    values.push(sum / blockSize);
  }

  const max = Math.max(...values);
  return max > 0 ? values.map((value) => value / max) : values;
}

export function drawWaveform(canvas: HTMLCanvasElement, data: number[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || data.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const { width, height } = rect;
  const barWidth = width / data.length;
  const barGap = 1;

  ctx.clearRect(0, 0, width, height);

  data.forEach((value, index) => {
    const barHeight = Math.max(2, value * height * 0.8);
    const x = index * barWidth;
    const y = (height - barHeight) / 2;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#8b949e');
    gradient.addColorStop(0.5, '#6e7681');
    gradient.addColorStop(1, '#8b949e');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth - barGap, barHeight);
  });
}
