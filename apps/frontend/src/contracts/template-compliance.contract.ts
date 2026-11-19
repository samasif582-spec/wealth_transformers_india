export const SEBI_AMFI_MANDATORY_FOOTER =
  'WealthTrade Securities Ltd | SEBI Reg: INZ000123456 | AMFI: ARN-98765. Investments are subject to market risks.';

export function validateSebiFooter(category: string, footer?: string): boolean {
  if (category === 'MARKETING') {
    return !!footer && footer.trim() === SEBI_AMFI_MANDATORY_FOOTER;
  }
  return true;
}
