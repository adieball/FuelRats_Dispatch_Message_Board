import { useState } from 'react';
import {
  authService, hasOAuthClientId, isRemoteBoardOrigin,
} from '../services/authService';
import { Button } from '@/app/components/ui/button';
import { LogIn } from 'lucide-react';
import fuelRatsLogo from './image/TransparentBackgroundRatto.png';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const remote = isRemoteBoardOrigin();
  const [error, setError] = useState<string | null>(
    hasOAuthClientId() ? null : 'This build has no FuelRats client id.',
  );
  const [callback, setCallback] = useState('');

  const signIn = () => {
    setError(null);
    try {
      const url = authService.authorizeUrl();
      if (remote) {
        const opened = window.open(url, '_blank');
        if (!opened) window.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
    }
  };

  const finishPaste = () => {
    setError(null);
    try {
      authService.completeFromCallbackInput(callback);
      onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that address.');
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-black relative overflow-hidden">
      <div
        className="absolute inset-[10%] bg-contain bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${fuelRatsLogo})` }}
      />

      <div className="relative z-10 w-full max-w-sm px-4">
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-orange-500">FuelRats Dispatch</h1>
            <p className="text-slate-400 text-sm mt-1">Sign in with your FuelRats account</p>
          </div>

          <Button
            type="button"
            onClick={signIn}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          >
            <span className="flex items-center gap-2">
              <LogIn className="w-4 h-4" />
              Sign in with FuelRats
            </span>
          </Button>

          {remote && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] text-slate-500 leading-snug">
                FuelRats sends you back to localhost:5173 on this Mac, which is
                not the board. After you authorise, copy the address from that
                tab (it still has the token even if the page failed to load)
                and paste it here.
              </p>
              <textarea
                value={callback}
                onChange={(e) => setCallback(e.target.value)}
                placeholder="http://localhost:5173/callback?access_token=…"
                rows={3}
                className="w-full bg-slate-950 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600"
              />
              <Button
                type="button"
                variant="outline"
                onClick={finishPaste}
                disabled={!callback.trim()}
                className="w-full"
              >
                Finish sign-in
              </Button>
            </div>
          )}

          {error && (
            <p className="mt-3 text-[11px] text-red-400 leading-snug">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
