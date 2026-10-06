const pad = (n: number) => String(n).padStart(2, '0');
export function localInputTime(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localIso(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  return `${localInputTime(date)}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
export function displayTime(iso: string): string {
  return localInputTime(new Date(iso)).replace('T', ' ');
}
export function nextUpdatedAt(previous?: string): string {
  return localIso(
    new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)),
  );
}
