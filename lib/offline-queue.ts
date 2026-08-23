import { QueuedReport } from "./types";

const QUEUE_KEY = "offline_reports";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getOfflineQueue(): QueuedReport[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedReport[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function addToOfflineQueue(report: QueuedReport): void {
  const queue = getOfflineQueue();
  queue.push(report);
  saveOfflineQueue(queue);
}

export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue().filter((r) => r.id !== id);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(QUEUE_KEY);
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string): Blob {
  const [meta, data] = base64.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}
