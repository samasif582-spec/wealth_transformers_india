import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';
import { ToastContainer } from './components/ui/Toast';

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}
