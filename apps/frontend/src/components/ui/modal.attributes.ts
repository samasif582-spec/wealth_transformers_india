export function getModalA11yProps(headlineId = 'modal-headline') {
  return {
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-labelledby': headlineId,
  };
}
