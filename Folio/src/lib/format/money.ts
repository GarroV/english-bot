// Format a rouble amount with ru-RU thousands grouping + trailing "₽" (e.g. "1 000 ₽").
export function formatRub(n: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ₽`;
}
