import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      theme="light"
      closeButton
      toastOptions={{
        style: {
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid rgba(167, 139, 250, 0.45)',
          borderRadius: '14px',
          color: '#312e81',
          boxShadow: '0 10px 30px rgba(109, 40, 217, 0.18)'
        },
        className: 'backdrop-blur-md',
        descriptionClassName: 'text-slate-600',
        actionButtonStyle: {
          background: '#7c3aed',
          color: '#ffffff'
        },
        cancelButtonStyle: {
          background: '#ede9fe',
          color: '#5b21b6'
        }
      }}
    />
  );
}
