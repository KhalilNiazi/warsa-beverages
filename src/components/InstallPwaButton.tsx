import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPwaButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!installPrompt) return null;

  const install = async () => {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  };

  return (
    <Button
      type="button"
      size="sm"
      onClick={install}
      className="h-7 gap-1.5 bg-red-600 px-2.5 text-[11px] font-bold text-white hover:bg-red-700"
    >
      <Download className="h-3.5 w-3.5" />
      Install app
    </Button>
  );
}
