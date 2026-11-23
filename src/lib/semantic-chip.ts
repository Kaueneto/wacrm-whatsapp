/** Shared semantic colors for status/category chips, independent of the accent theme. */
export const semanticChip = {
  success: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-[#67ffc1]',
  warning: 'border-amber-600/40 bg-amber-400/15 text-amber-900 dark:border-yellow-300/40 dark:bg-yellow-300/10 dark:text-[#ffe56b]',
  danger: 'border-red-600/30 bg-red-500/10 text-red-800 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-[#ff91ad]',
  info: 'border-blue-600/30 bg-blue-500/10 text-blue-800 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-[#7ddcff]',
  purple: 'border-purple-600/30 bg-purple-500/10 text-purple-800 dark:border-purple-400/40 dark:bg-purple-400/10 dark:text-[#ddb0ff]',
  orange: 'border-orange-600/30 bg-orange-500/10 text-orange-800 dark:border-orange-300/40 dark:bg-orange-300/10 dark:text-[#ffc18a]',
  neutral: 'border-border bg-muted text-muted-foreground',
} as const;

export const templateCategoryClasses = {
  Marketing: semanticChip.purple,
  Utility: semanticChip.info,
  Authentication: semanticChip.warning,
} as const;
