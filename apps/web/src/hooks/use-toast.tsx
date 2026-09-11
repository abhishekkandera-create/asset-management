import * as React from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastVariant,
} from '@/components/ui/toast';

interface ToastMessage {
  id: number;
  title: string;
  description?: string | undefined;
  variant?: ToastVariant | undefined;
}

interface ToastContextValue {
  toast: (message: Omit<ToastMessage, 'id'>) => void;
  /** Shorthands for the two cases every mutation needs. */
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastHost({ children }: { children: React.ReactNode }): JSX.Element {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const toast = React.useCallback((message: Omit<ToastMessage, 'id'>) => {
    nextId += 1;
    setMessages((current) => [...current, { ...message, id: nextId }]);
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, variant: 'success' }),
      error: (title, description) => toast({ title, description, variant: 'destructive' }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      <ToastProvider swipeDirection="right" duration={5000}>
        {children}
        {messages.map((message) => (
          <Toast
            key={message.id}
            variant={message.variant}
            onOpenChange={(open) => {
              if (!open) dismiss(message.id);
            }}
          >
            <div className="grid gap-1">
              <ToastTitle>{message.title}</ToastTitle>
              {message.description ? (
                <ToastDescription>{message.description}</ToastDescription>
              ) : null}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastHost');
  return context;
}
