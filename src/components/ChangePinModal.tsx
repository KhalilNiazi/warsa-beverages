import React, { useState } from 'react';
import { ResponsiveDialog } from './ui/responsive-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { AppUserProfile } from '@/src/types';
import { updateUserPin } from '@/src/api';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUserProfile;
  onPinUpdated?: () => void;
}

export function ChangePinModal({ isOpen, onClose, currentUser, onPinUpdated }: ChangePinModalProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setError('New PIN must be exactly 4 numerical digits.');
      return;
    }

    if (newPin !== confirmPin) {
      setError('New PIN and Confirm PIN do not match.');
      return;
    }

    try {
      const res = await updateUserPin(currentUser.id, currentPin, newPin);
      if (res.success) {
        setSuccess(res.message);
        setTimeout(() => {
          setCurrentPin('');
          setNewPin('');
          setConfirmPin('');
          setSuccess(null);
          if (onPinUpdated) onPinUpdated();
          onClose();
        }, 1200);
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating PIN.');
    }
  };

  return (
    <ResponsiveDialog
      isOpen={isOpen}
      onClose={() => {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setError(null);
        setSuccess(null);
        onClose();
      }}
      title="Change Security PIN"
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="p-2.5 rounded-lg bg-red-600 text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{currentUser.name}</h4>
            <p className="text-xs text-slate-500">{currentUser.roleTitle}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-700 font-bold">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Current 4-Digit PIN
            </label>
            <Input
              type="password"
              maxLength={4}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="text-center font-mono text-lg tracking-widest"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              New 4-Digit PIN
            </label>
            <Input
              type="password"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="text-center font-mono text-lg tracking-widest"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Confirm New PIN
            </label>
            <Input
              type="password"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="text-center font-mono text-lg tracking-widest"
              required
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
            Update PIN
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
