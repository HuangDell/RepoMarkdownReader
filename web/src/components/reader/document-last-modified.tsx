'use client';

import { useEffect, useState } from 'react';

function formatUtcFallback(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function DocumentLastModified({ value }: { value: string }) {
  const [formatted, setFormatted] = useState(() => formatUtcFallback(value));

  useEffect(() => {
    setFormatted(formatLocalDateTime(value));
  }, [value]);

  return (
    <span>
      Last modified: <time dateTime={value}>{formatted}</time>
    </span>
  );
}
