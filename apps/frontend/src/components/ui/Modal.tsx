import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  showCloseButton?: boolean;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-[95vw]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop with spring fade and blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/45 dark:bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Panel with Spring Physics - Apple macOS Sheet */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
            }}
            className={`relative w-full ${sizeClasses[size]} bg-white/95 dark:bg-[#1C1E24]/95 backdrop-blur-3xl rounded-[28px] shadow-[0_24px_70px_rgba(0,0,0,0.35)] border border-black/[0.08] dark:border-white/[0.12] overflow-hidden z-10`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
                  {title}
                </h3>
                {description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close modal"
                  className="w-7 h-7 rounded-full bg-black/[0.05] dark:bg-white/10 hover:bg-black/[0.1] dark:hover:bg-white/20 flex items-center justify-center text-slate-500 dark:text-white/80 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="px-6 py-5 max-h-[82vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
