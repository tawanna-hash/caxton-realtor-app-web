/**
 * Shared free-form date/time parsing for event extraction pipelines.
 *
 * Originally lived inline in gmail-event-scanner.ts; extracted so the
 * flyer-image extractor (gemini-event-flyer-extract.ts /
 * /api/admin/events/extract-flyer) can turn the same kind of verbatim
 * "Thursday, March 12" + "11:30 AM - 1:00 PM" strings into ISO timestamps
 * without duplicating the logic.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * America/Chicago UTC offset for a date, as `±HH:MM`. Mirrors the helper in
 * lib/fpr-scraper.ts — events are written in Central wall-clock time and the
 * server runs in UTC, so a naive Date would land 5-6 hours off.
 */
function getCentralOffset(year: number, month: number, day: number): string {
  const probe = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset',
  });
  const tzPart = fmt.formatToParts(probe).find((p) => p.type === 'timeZoneName');
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzPart?.value || 'GMT-6');
  if (!m) return '-06:00';
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
}

export function isoFromCentral(
  year: number, month: number, day: number, hour: number, minute: number,
): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00` +
    getCentralOffset(year, month, day)
  );
}

export interface CalendarDate { year: number; month: number; day: number }

/**
 * Pull a calendar date out of free-form text ("Thursday, March 12th",
 * "3/12/2026", "2026-03-12").
 *
 * When the year is absent we assume the event is upcoming relative to
 * `referenceDate` (defaults to now): same year, rolled forward if that
 * would place the event more than a month in the past. That's what makes
 * a December scan of a January flyer land in the right year.
 */
export function parseDateText(dateText: string, referenceDate: Date | null = null): CalendarDate | null {
  const text = dateText
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/\s+/g, ' ');

  let month: number | null = null;
  let day: number | null = null;
  let year: number | null = null;

  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const numeric = /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/.exec(text);
  const monthName = new RegExp(
    `\\b(${Object.keys(MONTHS).join('|')})\\b\\.?\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?`,
  ).exec(text);
  // "12 March 2026" — less common in US mail but cheap to support.
  const dayFirst = new RegExp(
    `\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join('|')})\\b\\.?(?:\\s*,?\\s*(\\d{4}))?`,
  ).exec(text);

  if (iso) {
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  } else if (monthName) {
    month = MONTHS[monthName[1]];
    day = parseInt(monthName[2], 10);
    year = monthName[3] ? parseInt(monthName[3], 10) : null;
  } else if (dayFirst) {
    day = parseInt(dayFirst[1], 10);
    month = MONTHS[dayFirst[2]];
    year = dayFirst[3] ? parseInt(dayFirst[3], 10) : null;
  } else if (numeric) {
    month = parseInt(numeric[1], 10);
    day = parseInt(numeric[2], 10);
    if (numeric[3]) {
      const y = parseInt(numeric[3], 10);
      year = y < 100 ? 2000 + y : y;
    }
  }

  if (month === null || day === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const reference = referenceDate ?? new Date();
  if (year === null) {
    year = reference.getUTCFullYear();
    const candidate = Date.UTC(year, month - 1, day);
    const monthBefore = reference.getTime() - 31 * 24 * 60 * 60 * 1000;
    if (candidate < monthBefore) year += 1;
  }

  // Reject impossible days (Feb 30) rather than letting Date roll them over.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return { year, month, day };
}

/** Extract up to two clock times from a range like "11:30 AM - 1:00 PM". */
export function parseTimes(timeText: string | null): Array<{ hour: number; minute: number }> {
  if (!timeText) return [];
  const out: Array<{ hour: number; minute: number }> = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(timeText)) !== null && out.length < 2) {
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (hour < 1 || hour > 12 || minute > 59) continue;
    const isPm = m[3].toLowerCase().startsWith('p');
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    out.push({ hour, minute });
  }
  return out;
}

/**
 * Turn verbatim date/time strings into ISO timestamps.
 * Returns nulls when the date is unparseable — the caller keeps the raw text
 * somewhere visible so an admin can fix it by hand.
 */
export function parseEventWhen(
  dateText: string | null,
  timeText: string | null,
  referenceDate: Date | null = null,
): { startDate: string | null; endDate: string | null } {
  if (!dateText) return { startDate: null, endDate: null };
  const date = parseDateText(dateText, referenceDate);
  if (!date) return { startDate: null, endDate: null };

  const times = parseTimes(timeText);
  const start = times[0] ?? { hour: 0, minute: 0 };
  const startDate = isoFromCentral(date.year, date.month, date.day, start.hour, start.minute);

  let endDate: string | null = null;
  if (times[1]) {
    // An end time earlier than the start means the range crossed midnight.
    const rollsOver =
      times[1].hour * 60 + times[1].minute < start.hour * 60 + start.minute;
    const endBase = rollsOver
      ? new Date(Date.UTC(date.year, date.month - 1, date.day + 1))
      : null;
    endDate = endBase
      ? isoFromCentral(
          endBase.getUTCFullYear(), endBase.getUTCMonth() + 1, endBase.getUTCDate(),
          times[1].hour, times[1].minute,
        )
      : isoFromCentral(date.year, date.month, date.day, times[1].hour, times[1].minute);
  }

  return { startDate, endDate };
}

/**
 * Combine separate start/end time-of-day strings (as the flyer extractor
 * returns them) into the "H:MM AM - H:MM PM" shape parseEventWhen expects.
 */
export function combineTimeRange(startTime: string | null, endTime: string | null): string | null {
  if (!startTime && !endTime) return null;
  if (startTime && endTime) return `${startTime} - ${endTime}`;
  return startTime ?? endTime;
}
