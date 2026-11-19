export const DPDP_CONFIRMATION_KEYWORD = 'ERASE_PERMANENTLY';

export const DpdpErasureModalContract = {
  confirmationKeyword: DPDP_CONFIRMATION_KEYWORD,
  isIrreversible: true,
  targetMask: 'ERASED_{uuid}',
};

export function validateDpdpErasureConfirmation(keyword: string): { valid: boolean; error?: string } {
  if (keyword !== DPDP_CONFIRMATION_KEYWORD) {
    return {
      valid: false,
      error: `Confirmation keyword must match '${DPDP_CONFIRMATION_KEYWORD}' exactly`,
    };
  }
  return { valid: true };
}
