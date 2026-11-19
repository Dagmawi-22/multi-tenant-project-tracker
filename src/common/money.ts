export function formatEtb(value: string | number): string {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function budgetSummary(budgetEtb: string, spentEtb: string) {
  const budget = Number(budgetEtb);
  const spent = Number(spentEtb);
  const remaining = budget - spent;

  return {
    budgetFormatted: formatEtb(budget),
    spentFormatted: formatEtb(spent),
    remainingFormatted: formatEtb(remaining),
    percentUsed: budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0,
    isOverBudget: spent > budget,
  };
}
