import { API_URL, OFFLINE } from './config';
import { SAMPLE_VERDICT } from '@/data';
import type { Verdict } from '@/state/store';
import type { Axes } from '@/components/Mark';

export type ReadResult = Omit<Verdict, 'unblurred' | 'createdAt' | 'id'> & { id?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Submit a recorded Read. Multipart upload, synchronous response (server takes 8–20 s). */
export async function submitRead(opts: {
  uri: string;
  promptId: string;
  promptText: string;
  name: string;
  intensity: 'straight' | 'unsparing';
  history: { index: number; axes: Axes; tells: string[]; createdAt: string }[];
  onStage?: (stage: string) => void;
}): Promise<ReadResult> {
  if (OFFLINE) {
    for (const s of ['Listening', 'Watching', 'Reading', 'Poise is writing']) {
      opts.onStage?.(s);
      await sleep(1100);
    }
    return { ...SAMPLE_VERDICT, promptId: opts.promptId };
  }

  const form = new FormData();
  form.append('video', { uri: opts.uri, name: 'read.mp4', type: 'video/mp4' } as any);
  form.append('prompt_id', opts.promptId);
  form.append('prompt_text', opts.promptText);
  form.append('name', opts.name);
  form.append('intensity', opts.intensity);
  form.append('history', JSON.stringify(opts.history));

  opts.onStage?.('Uploading');
  const res = await fetch(`${API_URL}/read`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`read failed: ${res.status} ${await res.text()}`);
  opts.onStage?.('Poise is writing');
  return (await res.json()) as ReadResult;
}

export async function scorePressure(opts: { uri: string; promptText: string; seconds: number }): Promise<{ composure: number; firstWordMs: number; fillers: number; finished: boolean; line: string }> {
  if (OFFLINE) {
    await sleep(900);
    return { composure: 55 + Math.round(Math.random() * 30), firstWordMs: 800 + Math.round(Math.random() * 1500), fillers: Math.round(Math.random() * 4), finished: Math.random() > 0.3, line: 'You started on time and lost it in the middle.' };
  }
  const form = new FormData();
  form.append('audio', { uri: opts.uri, name: 'round.m4a', type: 'audio/m4a' } as any);
  form.append('prompt_text', opts.promptText);
  form.append('seconds', String(opts.seconds));
  const res = await fetch(`${API_URL}/pressure`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`pressure failed: ${res.status}`);
  return res.json();
}

export function ttsUrl(text: string) {
  return `${API_URL}/tts?text=${encodeURIComponent(text)}`;
}
