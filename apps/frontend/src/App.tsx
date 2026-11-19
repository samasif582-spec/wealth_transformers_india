import React, { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';
import { ToastContainer } from './components/ui/Toast';
import { BrandSplashScreen } from './components/brand/BrandSplashScreen';

export default function App(): React.ReactElement {
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('wt_splash_seen');
  });

  const handleSplashComplete = () => {
    sessionStorage.setItem('wt_splash_seen', 'true');
    setShowSplash(false);
  };

  return (
    <BrowserRouter>
      {showSplash && <BrandSplashScreen onComplete={handleSplashComplete} />}
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}
