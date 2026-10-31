import type { LogFilters, LogRecord, MatchMode } from './logRecord';
import { parseTimestamp } from './timestamps';
import { LOG_LEVEL_MATRIX } from '../constants';

type Expression =
  | { kind: 'term'; pattern: RegExp }
  | { kind: 'gap'; seconds: number }
  | { kind: 'not'; child: Expression }
  | { kind: 'and' | 'or'; children: Expression[] };

export interface CompiledQuery {
  expression: Expression | null;
  rowStart: number | null;
  rowEnd: number | null;
  timeStart: number | null;
  timeEnd: number | null;
  highlights: RegExp[];
  error: string | null;
}

export function searchableText(record: LogRecord): string {
  return [
    record.message,
    record.timestamp,
    record.level,
    record.module,
    record.thread,
    record.process,
    record.processName,
    record.lineNumber,
  ]
    .filter((value) => value != null)
    .join(' ');
}

/** Split only at the current nesting level; quoted operators remain literal text. */
function splitExpression(text: string, operator: '||' | '&&'): string[] {
  let depth = 0;
  let quoted = false;
  let characterClass = false;
  let start = 0;
  const parts: string[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '\\') {
      index++;
      continue;
    }
    if (character === '"' && !characterClass) quoted = !quoted;
    if (quoted) continue;
    if (character === '[') characterClass = true;
    if (character === ']') characterClass = false;
    if (characterClass) continue;
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (depth < 0) throw new Error('Unexpected closing parenthesis.');
    if (depth === 0 && text.slice(index, index + 2) === operator) {
      parts.push(text.slice(start, index).trim());
      start = index + 2;
      index++;
    }
  }
  if (quoted || depth !== 0) throw new Error('Unclosed quote or parenthesis.');
  if (parts.length === 0) return [text];
  parts.push(text.slice(start).trim());
  return parts;
}

function parseExpression(
  text: string,
  mode: MatchMode,
  caseSensitive: boolean,
  depth = 0,
): Expression {
  if (depth > 32) throw new Error('Filter nesting is too deep.');
  if (!text.trim()) throw new Error('Enter a term on both sides of an operator.');
  for (const [operator, kind] of [
    ['||', 'or'],
    ['&&', 'and'],
  ] as const) {
    const parts = splitExpression(text, operator);
    if (parts.length > 1) {
      return {
        kind,
        children: parts.map((part) => parseExpression(part, mode, caseSensitive, depth + 1)),
      };
    }
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return parseExpression(trimmed.slice(1, -1), mode, caseSensitive, depth + 1);
  }
  if (trimmed.startsWith('!')) {
    return {
      kind: 'not',
      child: parseExpression(trimmed.slice(1), mode, caseSensitive, depth + 1),
    };
  }
  const gap = /^#gap=(\d+(?:\.\d+)?)$/i.exec(trimmed);
  if (gap) return { kind: 'gap', seconds: Number(gap[1]) };
  const term = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (mode === 'regex' && term.length > 256)
    throw new Error('Regex patterns must be at most 256 characters.');
  const pattern = mode === 'regex' ? term : term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { kind: 'term', pattern: new RegExp(pattern, caseSensitive ? '' : 'i') };
}

/** Compile once per edit, then reuse for filtering, navigation, and highlighting. */
export function compileQuery(
  text = '',
  mode: MatchMode = 'text',
  caseSensitive = false,
): CompiledQuery {
  const result: CompiledQuery = {
    expression: null,
    rowStart: null,
    rowEnd: null,
    timeStart: null,
    timeEnd: null,
    highlights: [],
    error: null,
  };
  try {
    if (text.length > 4096) throw new Error('Filters must be at most 4096 characters.');
    // Ranges constrain the whole query, preserving the viewer's existing range syntax.
    const endpoint = '#(\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{2}:\\d{2}:\\d{2}(?:[:.]\\d{3})?)?|\\d+)';
    const range = new RegExp(`(?:${endpoint})?\\s*::\\s*(?:${endpoint})?`);
    const match = range.exec(text);
    if (match) {
      function applyEndpoint(value: string | undefined, start: boolean): void {
        if (!value) return;
        if (/^\d+$/.test(value)) {
          if (start) result.rowStart = Number(value);
          else result.rowEnd = Number(value);
          return;
        }
        let time = parseTimestamp(value);
        if (time === null) throw new Error('Invalid date in range.');
        if (!start && value.length === 10) {
          const end = new Date(time);
          end.setDate(end.getDate() + 1);
          time = end.getTime() - 1;
        }
        if (start) result.timeStart = time;
        else result.timeEnd = time;
      }
      applyEndpoint(match[1], true);
      applyEndpoint(match[2], false);
      text = text
        .replace(range, '')
        .replace(/^\s*(?:\|\||&&)|(?:\|\||&&)\s*$/g, '')
        .trim();
    }
    if (text.trim()) result.expression = parseExpression(text, mode, caseSensitive);
    function collectHighlights(expression: Expression, excluded = false): void {
      if (expression.kind === 'term' && !excluded) result.highlights.push(expression.pattern);
      if (expression.kind === 'not') collectHighlights(expression.child, !excluded);
      if (expression.kind === 'and' || expression.kind === 'or') {
        for (const child of expression.children) collectHighlights(child, excluded);
      }
    }
    if (result.expression) collectHighlights(result.expression);
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Invalid filter.';
  }
  return result;
}

function evaluate(expression: Expression, text: string, gapSeconds: number | null): boolean {
  switch (expression.kind) {
    case 'term':
      return expression.pattern.test(text);
    case 'gap':
      return gapSeconds !== null && gapSeconds >= expression.seconds;
    case 'not':
      return !evaluate(expression.child, text, gapSeconds);
    case 'and':
      return expression.children.every((child) => evaluate(child, text, gapSeconds));
    case 'or':
      return expression.children.some((child) => evaluate(child, text, gapSeconds));
  }
}

export function matchesQuery(
  query: CompiledQuery,
  record: LogRecord,
  previous?: LogRecord,
): boolean {
  if (query.error) return false;
  if (query.rowStart !== null && record.lineNumber < query.rowStart) return false;
  if (query.rowEnd !== null && record.lineNumber > query.rowEnd) return false;
  if (
    query.timeStart !== null &&
    (record.timestampMs === null || record.timestampMs < query.timeStart)
  )
    return false;
  if (query.timeEnd !== null && (record.timestampMs === null || record.timestampMs > query.timeEnd))
    return false;
  const gap =
    record.timestampMs != null && previous?.timestampMs != null
      ? (record.timestampMs - previous.timestampMs) / 1000
      : null;
  return query.expression === null || evaluate(query.expression, searchableText(record), gap);
}

export function filterLogs(logs: readonly LogRecord[], filters: LogFilters): LogRecord[] {
  const query = compileQuery(filters.searchText, filters.filterMode, filters.filterCaseSensitive);
  const matches = new Set<number>();
  for (let index = 0; index < logs.length; index++) {
    const record = logs[index];
    if (!matchesQuery(query, record, logs[index - 1])) continue;
    if (!filters.logLevel.includes('all')) {
      const level = LOG_LEVEL_MATRIX.find((variants) =>
        variants.some(
          (value) =>
            value
              .replace(/[[\]:]/g, '')
              .trim()
              .toLowerCase() === record.level?.trim().toLowerCase(),
        ),
      )?.[0];
      if (!level || !filters.logLevel.includes(level)) continue;
    }
    if (filters.selectedModule !== 'all' && filters.selectedModule !== record.module.trim())
      continue;
    matches.add(index);
  }
  const contextLines = Math.max(0, Math.min(1000, Math.floor(filters.contextLines || 0)));
  if (contextLines === 0) return [...matches].map((index) => logs[index]);
  // Merge intervals so overlapping context windows never require O(rows * context) work.
  const included: LogRecord[] = [];
  let lastIncluded = -1;
  for (const index of matches) {
    const start = Math.max(lastIncluded + 1, index - contextLines, 0);
    const end = Math.min(logs.length - 1, index + contextLines);
    for (let position = start; position <= end; position++) {
      included.push({ ...logs[position], isContextLine: !matches.has(position) });
    }
    lastIncluded = Math.max(lastIncluded, end);
  }
  return included;
}

export interface HighlightSegment {
  text: string;
  kind: 'plain' | 'filter' | 'search';
}

/** Work on text offsets; never generate HTML or match inside generated markup. */
export function highlightSegments(
  text: string,
  filter: CompiledQuery,
  search: CompiledQuery,
): HighlightSegment[] {
  const ranges: { start: number; end: number; kind: 'filter' | 'search' }[] = [];
  for (const [query, kind] of [
    [filter, 'filter'],
    [search, 'search'],
  ] as const) {
    for (const pattern of query.highlights) {
      const global = new RegExp(pattern.source, `${pattern.flags}g`);
      for (const match of text.matchAll(global)) {
        if (match[0].length > 0)
          ranges.push({ start: match.index, end: match.index + match[0].length, kind });
        if (ranges.length >= 10000) break;
      }
    }
  }
  const boundaries = [
    ...new Set([0, text.length, ...ranges.flatMap((range) => [range.start, range.end])]),
  ].sort((a, b) => a - b);
  const result: HighlightSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const overlaps = ranges.filter((range) => range.start <= start && range.end >= end);
    const kind = overlaps.some((range) => range.kind === 'search')
      ? 'search'
      : overlaps.length
        ? 'filter'
        : 'plain';
    result.push({ text: text.slice(start, end), kind });
  }
  return result;
}
