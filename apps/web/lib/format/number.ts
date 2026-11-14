/** A whole number with the learner's digit grouping, such as "12,400". */
export function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

/** "1 step", "3 steps"; pass `pluralLabel` for irregular plurals. */
export function formatCount(
  count: number,
  singular: string,
  pluralLabel = `${singular}s`,
) {
  const label = count === 1 ? singular : pluralLabel;

  return `${formatNumber(count)} ${label}`;
}
