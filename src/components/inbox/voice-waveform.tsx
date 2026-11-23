"use client";

import { useEffect, useRef } from "react";

/** Visualizes the recorder's existing microphone stream without opening another one. */
export function VoiceWaveform({ source, paused }: { source?: MediaStreamAudioSourceNode; paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levels = useRef<number[]>(Array(40).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const analyser = source.context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let lastSample = 0;
    const draw = (now: number) => {
      if (!paused && now - lastSample >= 70) {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        levels.current = [...levels.current.slice(1), Math.min(1, rms * 5)];
        lastSample = now;
      }
      const width = canvas.clientWidth;
      const height = 32;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = getComputedStyle(canvas).color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        const visibleLevels = levels.current.slice(-Math.max(1, Math.min(40, Math.floor(width / 4))));
        visibleLevels.forEach((level, index) => {
          const x = (index + .5) * 4 + (width - visibleLevels.length * 4) / 2;
          const amplitude = Math.max(2, level * 28);
          ctx.beginPath();
          ctx.moveTo(x, (height - amplitude) / 2);
          ctx.lineTo(x, (height + amplitude) / 2);
          ctx.stroke();
        });
      }
      if (!paused) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      try { source.disconnect(analyser); } catch { /* The recorder may already have closed its context. */ }
      analyser.disconnect();
    };
  }, [source, paused]);

  return <canvas ref={canvasRef} aria-hidden="true" className="h-8 w-full min-w-0 text-muted-foreground" />;
}
