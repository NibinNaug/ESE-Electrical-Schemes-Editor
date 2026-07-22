export const parsePageSelection = (value: string, pageCount: number): number[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const selected = new Set<number>();
  for (const rawPart of trimmed.split(/[;,]/)) {
    const part = rawPart.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = part.match(/^\d+$/);
    if (!range && !single) throw new Error(`S\u00e9lection invalide : \u00ab ${part} \u00bb.`);

    const first = Number(range?.[1] ?? part);
    const last = Number(range?.[2] ?? part);
    if (first < 1 || last < 1 || first > pageCount || last > pageCount) {
      throw new Error(`Les pages doivent \u00eatre comprises entre 1 et ${pageCount}.`);
    }
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    for (let page = start; page <= end; page += 1) selected.add(page);
  }

  return [...selected].sort((a, b) => a - b);
};

export const formatPageSelection = (pages: Iterable<number>): string => {
  const values = [...new Set(pages)].sort((a, b) => a - b);
  if (!values.length) return "";

  const parts: string[] = [];
  let start = values[0];
  let previous = values[0];
  for (const value of values.slice(1)) {
    if (value === previous + 1) {
      previous = value;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    start = value;
    previous = value;
  }
  parts.push(start === previous ? String(start) : `${start}-${previous}`);
  return parts.join(", ");
};
