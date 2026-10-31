import type { DateFormat } from './logRecord';

/** Parse explicitly rather than relying on browser-specific Date string parsing. */
export function parseTimestamp(value: string, dateFormat: DateFormat = 'DD/MM/YY'): number | null {
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:[:.](\d{1,6}))?(Z|[+-]\d{2}:\d{2})?)?$/.exec(
      value,
    );
  if (iso) {
    const [
      ,
      year,
      month,
      day,
      hour = '00',
      minute = '00',
      second = '00',
      fraction = '',
      zone = '',
    ] = iso;
    const milliseconds = fraction.padEnd(3, '0').slice(0, 3);
    const components = [
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ];
    if (!validComponents(components)) return null;
    const date = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${zone}`,
    );
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  }

  const slash =
    /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:[:.](\d{1,6}))?$/.exec(value);
  if (slash) {
    const [, first, second, shortYear, hour, minute, sec, fraction = ''] = slash;
    const year =
      shortYear.length === 4 ? shortYear : `${Number(shortYear) > 50 ? '19' : '20'}${shortYear}`;
    const month = dateFormat === 'MM/DD/YY' ? first : second;
    const day = dateFormat === 'MM/DD/YY' ? second : first;
    return parseTimestamp(
      `${year}-${month}-${day} ${hour}:${minute}:${sec}.${fraction.padEnd(3, '0')}`,
    );
  }

  const named = /^(\d{4})-([A-Za-z]{3})-(\d{2})\s+(.+)$/.exec(value);
  if (named) {
    const month =
      ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        named[2].toLowerCase(),
      ) + 1;
    if (month === 0) return null;
    return parseTimestamp(`${named[1]}-${String(month).padStart(2, '0')}-${named[3]} ${named[4]}`);
  }
  return null;
}

function validComponents([year, month, day, hour, minute, second]: number[]): boolean {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour >= 0 &&
    hour < 24 &&
    minute >= 0 &&
    minute < 60 &&
    second >= 0 &&
    second < 60
  );
}

export function normalizeTimestamp(value: string): Date | null {
  const milliseconds = parseTimestamp(value);
  return milliseconds === null ? null : new Date(milliseconds);
}
