export function dateKey(date = new Date(), timeZone = 'Africa/Casablanca') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function previousDateKey(date = new Date(), timeZone = 'Africa/Casablanca') {
  return dateKey(new Date(date.getTime() - 24 * 60 * 60 * 1000), timeZone);
}

/**
 * The date of the Monday of the week the given moment falls into. It is used
 * as a stable key for weekly schedules.
 */
export function weekKey(date = new Date(), timeZone = 'Africa/Casablanca') {
  const [year, month, day] = dateKey(date, timeZone).split('-').map(Number);
  const midnight = Date.UTC(year, month - 1, day);
  const weekday = (new Date(midnight).getUTCDay() + 6) % 7;
  return new Date(midnight - weekday * 86_400_000).toISOString().slice(0, 10);
}

export function localTimeString(date = new Date(), timeZone = 'Africa/Casablanca') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function durationText(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function parseDuration(input) {
  const value = String(input ?? '').trim().toLowerCase();
  const match = /^(\d{1,5})\s*([smhd])$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = amount * multipliers[unit];
  if (ms < 1000 || ms > 28 * 86_400_000) return null;
  return ms;
}

export function daysBetweenKeys(older, newer) {
  if (!older || !newer) return null;
  const a = Date.parse(`${older}T00:00:00Z`);
  const b = Date.parse(`${newer}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
