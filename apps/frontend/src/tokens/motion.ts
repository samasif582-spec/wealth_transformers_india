/**
 * Motion & Animation Tokens for Framer Motion Design System
 */
export const SPRING_PHYSICS = {
  stiffness: 350,
  damping: 25,
  mass: 1,
} as const;

export const BACKDROP_BLUR = '8px' as const;

export const SLIDE_OVER_VARIANTS = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
} as const;

export const MODAL_ANIMATION_VARIANTS = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
} as const;

export const WIZARD_TRANSITION_VARIANTS = (direction: -1 | 1) => ({
  initial: { x: direction > 0 ? '100%' : '-100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: direction > 0 ? '-100%' : '100%', opacity: 0 },
});

export const MOTION_TOKENS = {
  spring: SPRING_PHYSICS,
  backdropBlur: BACKDROP_BLUR,
  slideOver: SLIDE_OVER_VARIANTS,
  modal: MODAL_ANIMATION_VARIANTS,
  wizardTransition: WIZARD_TRANSITION_VARIANTS,
} as const;
