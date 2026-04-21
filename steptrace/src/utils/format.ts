export function renderTemplate(template: string, date: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const map: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return template.replace(/\{(yyyy|MM|dd|HH|mm|ss)\}/g, (_, k) => map[k] ?? '');
}

export function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_');
}

export function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return '';
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const secs = Math.round((end - start) / 1000);
  return `${Math.floor(secs / 60)}min ${secs % 60}s`;
}
