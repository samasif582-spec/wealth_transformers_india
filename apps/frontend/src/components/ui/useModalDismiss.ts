export function createModalController(onDismiss: () => void, isLocked = false) {
  let dismissed = false;

  const handleKeyDown = (e: { key: string }) => {
    if (e.key === 'Escape' && !isLocked) {
      dismissed = true;
      onDismiss();
    }
  };

  const handleBackdropClick = (clickLocked = isLocked) => {
    if (!clickLocked) {
      dismissed = true;
      onDismiss();
    }
  };

  return {
    handleKeyDown,
    handleBackdropClick,
    isDismissed: () => dismissed,
  };
}
