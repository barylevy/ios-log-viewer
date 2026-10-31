import { useMemo } from 'react';
import { highlightSegments, type CompiledQuery } from '../domain/logQuery';

interface Props {
  text: string;
  filter: CompiledQuery;
  search: CompiledQuery;
}

export default function HighlightedText({ text, filter, search }: Props) {
  const segments = useMemo(() => highlightSegments(text, filter, search), [text, filter, search]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'plain' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <mark
            key={index}
            className={
              segment.kind === 'search'
                ? 'bg-green-200 dark:bg-green-600 font-bold'
                : 'bg-blue-200 dark:bg-blue-500'
            }
          >
            {segment.text}
          </mark>
        ),
      )}
    </>
  );
}
