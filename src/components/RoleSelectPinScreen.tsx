import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  Droplet, 
  Delete,
  ArrowRight,
  User,
  Truck,
  LogIn,
  Eye,
  EyeOff,
  Database,
  UserPlus
} from 'lucide-react';
import { AppUserProfile } from '@/src/types';
import { getAppUsers, authenticateUserPin, authenticateUserPassword } from '@/src/api';
import { 
  auth,
  firebaseConfig,
  signInWithEmail, 
  sendFirebasePasswordReset,
  signOutFirebase,
  mapFirebaseUserToProfile 
} from '@/src/lib/firebase';
import { fetchUsersFromFirestore } from '@/src/lib/firestoreSync';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

interface RoleSelectPinScreenProps {
  onAuthenticated: (user: AppUserProfile) => void;
}

export function RoleSelectPinScreen({ onAuthenticated }: RoleSelectPinScreenProps) {
  const [allUsers, setAllUsers] = useState<AppUserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<AppUserProfile | null>(null);
  const [firebaseProfile, setFirebaseProfile] = useState<AppUserProfile | null>(null);
  
  // Firebase Auth Form State (Gate 1: Mandatory Firebase Login)
  const [firebaseEmail, setFirebaseEmail] = useState('');
  const [firebasePassword, setFirebasePassword] = useState('');
  const [showFirebasePassword, setShowFirebasePassword] = useState(false);

  // Staff PIN / Password mode (Gate 2: Active when Firebase is already authenticated)
  const [authMode, setAuthMode] = useState<'pin' | 'password'>('pin');
  const [pinInput, setPinInput] = useState<string>('');
  const [showPinDigits, setShowPinDigits] = useState(false);
  const [staffUsernameInput, setStaffUsernameInput] = useState('');
  const [staffPasswordInput, setStaffPasswordInput] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  // Feedback state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA state
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [pendingCredentials, setPendingCredentials] = useState<{ type: 'pin' | 'password'; value: string; userId?: string } | null>(null);

  const isFirebaseLoggedIn = !!auth.currentUser && !auth.currentUser.isAnonymous;

  // Load staff users from local storage & sync with Firestore
  useEffect(() => {
    const localUsers = getAppUsers();
    setAllUsers(localUsers);
    if (localUsers.length > 0) {
      setSelectedUser(localUsers[0]);
      setStaffUsernameInput(localUsers[0].username || '');
    }

    // Always fetch latest staff accounts from Firebase Firestore database
    fetchUsersFromFirestore().then((cloudUsers) => {
      if (cloudUsers && cloudUsers.length > 0) {
        setAllUsers(cloudUsers);
        setSelectedUser((prev) => prev ? (cloudUsers.find(u => u.id === prev.id) || cloudUsers[0]) : cloudUsers[0]);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
      setFirebaseProfile(null);
      return;
    }
    mapFirebaseUserToProfile(auth.currentUser)
      .then((profile) => {
        setProfileLoadError(null);
        setFirebaseProfile(profile);
      })
      .catch((error: unknown) => {
        console.error('[Auth] Could not load Firebase account permissions:', error);
        setFirebaseProfile(null);
        setProfileLoadError(error instanceof Error ? error.message : 'Could not load Firebase account permissions.');
      });
  }, [isFirebaseLoggedIn]);

  const handleSelectUser = (user: AppUserProfile) => {
    setSelectedUser(user);
    setStaffUsernameInput(user.username || '');
    setPinInput('');
    setStaffPasswordInput('');
    setErrorMessage(null);
    setTwoFactorRequired(false);
    setTwoFactorCode('');
    setPendingCredentials(null);
  };

  // =========================================================================
  // GATE 1: FIREBASE AUTHENTICATION HANDLERS
  // =========================================================================

  // Email / Password Firebase Authentication
  const handleFirebaseEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseEmail || !firebasePassword) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { profile } = await signInWithEmail(firebaseEmail.trim(), firebasePassword);
      if (profile.allowedPages.length === 0) {
        throw new Error('This account has no assigned application role. Contact an administrator.');
      }
      setIsSuccess(true);
      setFirebaseProfile(profile);
    } catch (err: any) {
      console.error('Firebase Email Auth notice:', err);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        setErrorMessage('Invalid Firebase email or password.');
      } else {
        setErrorMessage(err.message || 'Firebase login failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFirebasePasswordReset = async () => {
    const email = firebaseEmail.trim();
    if (!email) {
      setErrorMessage('Enter your email address first.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await sendFirebasePasswordReset(email);
      setErrorMessage('Password reset instructions were sent to your email.');
    } catch (err: any) {
      console.error('Firebase password reset notice:', err);
      setErrorMessage(err.code === 'auth/user-not-found'
        ? 'No Firebase account was found for this email.'
        : err.message || 'Could not send password reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // GATE 2: STAFF PIN & PASSWORD VERIFICATION (AFTER FIREBASE LOGIN)
  // =========================================================================
  const verifyPin = useCallback(async (pinToTest: string, user: AppUserProfile, mfa?: string) => {
    if (pinToTest.length !== 4) return;
    setIsSubmitting(true);

    try {
      const result = await authenticateUserPin(user.id, pinToTest, mfa);
      if (result.requiresTwoFactor) {
        setTwoFactorRequired(true);
        setPendingCredentials({ type: 'pin', value: pinToTest, userId: user.id });
        setErrorMessage(result.error || 'Enter 6-digit Authenticator code.');
        setIsSubmitting(false);
        return;
      }

      if (result.success && result.user) {
        setIsSuccess(true);
        setErrorMessage(null);
        setTimeout(() => {
          onAuthenticated(result.user!);
        }, 350);
      } else {
        setIsShaking(true);
        setErrorMessage(result.error || 'Incorrect 4-digit PIN. Please try again.');
        setTimeout(() => {
          setIsShaking(false);
          if (!result.requiresTwoFactor) {
            setPinInput('');
          }
        }, 600);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error.');
    } finally {
      setIsSubmitting(false);
    }
  }, [onAuthenticated]);

  const handleKeyPress = (num: string) => {
    if (isSuccess || !selectedUser || isSubmitting) return;
    if (twoFactorRequired) {
      if (twoFactorCode.length < 6) {
        const nextMfa = twoFactorCode + num;
        setTwoFactorCode(nextMfa);
        if (nextMfa.length === 6 && pendingCredentials) {
          if (pendingCredentials.type === 'pin') {
            verifyPin(pendingCredentials.value, selectedUser, nextMfa);
          }
        }
      }
      return;
    }

    if (pinInput.length < 4) {
      const nextPin = pinInput + num;
      setPinInput(nextPin);
      setErrorMessage(null);
      if (nextPin.length === 4) {
        verifyPin(nextPin, selectedUser);
      }
    }
  };

  const handleBackspace = () => {
    if (isSuccess) return;
    if (twoFactorRequired) {
      setTwoFactorCode(prev => prev.slice(0, -1));
      return;
    }
    setPinInput(prev => prev.slice(0, -1));
    setErrorMessage(null);
  };

  const handleClear = () => {
    if (isSuccess) return;
    if (twoFactorRequired) {
      setTwoFactorCode('');
      return;
    }
    setPinInput('');
    setErrorMessage(null);
  };

  const handleStaffPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffUsernameInput || !staffPasswordInput) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authenticateUserPassword(staffUsernameInput, staffPasswordInput, twoFactorCode);
      if (result.requiresTwoFactor) {
        setTwoFactorRequired(true);
        setPendingCredentials({ type: 'password', value: staffPasswordInput });
        setErrorMessage(result.error || 'Enter 6-digit Authenticator code.');
        setIsSubmitting(false);
        return;
      }

      if (result.success && result.user) {
        setIsSuccess(true);
        setErrorMessage(null);
        setTimeout(() => {
          onAuthenticated(result.user!);
        }, 350);
      } else {
        setIsShaking(true);
        setErrorMessage(result.error || 'Invalid username or password.');
        setTimeout(() => {
          setIsShaking(false);
        }, 600);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard listener for PIN mode
  useEffect(() => {
    if (!isFirebaseLoggedIn) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (authMode !== 'pin' || !selectedUser || isSuccess) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authMode, selectedUser, pinInput, isSuccess, verifyPin, isFirebaseLoggedIn]);

  // =========================================================================
  // VIEW 1: MANDATORY FIREBASE AUTHENTICATION GATE
  // (Rendered by default when no Firebase account login exists)
  // =========================================================================
  if (!isFirebaseLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between font-sans antialiased selection:bg-red-600 selection:text-white">
        {/* Top Header */}
        <header className="border-b border-red-100 bg-white px-4 md:px-8 py-3.5 shadow-xs">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-red-600 p-2.5 rounded-xl shadow-md shadow-red-600/20 flex items-center justify-center">
                <Droplet className="h-6 w-6 text-white fill-white" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-black tracking-tight text-gray-900 uppercase">
                  KFM Beverages <span className="text-red-600">(WARSA)</span>
                </h1>
                <p className="text-xs text-gray-500 font-medium">
                  Warehouse Stock, Deliveries, Orders, Cash Slips &amp; 8-Point Reconciliations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                <Lock className="h-3.5 w-3.5 text-red-600" />
                Authentication Required
              </span>
            </div>
          </div>
        </header>

        {/* Central Login Gate */}
        <main className="max-w-md mx-auto px-4 py-8 md:py-12 w-full flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl",
              isShaking && "animate-shake"
            )}
          >
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-red-50 border border-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Sign In
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your credentials to access the WARSA distribution system.
              </p>
            </div>

            {/* Status Feedback */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-800">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {isSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Authenticated! Launching system...</span>
              </div>
            )}

            {/* Email/password authentication */}
            <div className="space-y-3">
              <form onSubmit={handleFirebaseEmailAuth} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={firebaseEmail}
                    onChange={(e) => setFirebaseEmail(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <input
                      type={showFirebasePassword ? "text" : "password"}
                      required
                      placeholder="Enter password"
                      value={firebasePassword}
                      onChange={(e) => setFirebasePassword(e.target.value)}
                      className="w-full h-10 px-3 pr-10 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFirebasePassword(!showFirebasePassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showFirebasePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || isSuccess}
                  className="w-full h-11 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-red-600/20 flex items-center justify-center gap-2 mt-2 cursor-pointer"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Login</span>
                </button>
                <button
                  type="button"
                  onClick={handleFirebasePasswordReset}
                  disabled={isSubmitting || isSuccess}
                  className="w-full text-xs font-bold text-red-700 hover:text-red-800 disabled:opacity-50"
                >
                  Forgot password? Send reset email
                </button>
              </form>

              <p className="text-center pt-2 text-xs text-slate-500">
                Sign in with your authorized account, then enter the staff PIN to open the application.
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 space-y-1.5 text-center">
              <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
                <Database className="h-3 w-3 text-red-600" />
                Firebase Database: {firebaseConfig.projectId}
              </span>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Firebase login is kept for this browser session. Staff access is completed with the assigned PIN.
              </p>
            </div>
          </motion.div>
        </main>

        <footer className="text-center py-4 text-xs text-slate-400 border-t border-slate-100 bg-white">
          <span>KFM Beverages WARSA &bull; Enterprise Water Distribution Platform</span>
        </footer>
      </div>
    );
  }

  if (!firebaseProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-600" />
          <h1 className="text-lg font-bold text-slate-900">Unable to load account permissions</h1>
          <p className="mt-2 text-sm text-slate-600">
            {profileLoadError || 'Firebase authentication completed, but the account profile could not be loaded.'}
          </p>
          <button
            type="button"
            onClick={() => signOutFirebase().catch((error) => console.error('[Auth] Sign-out failed:', error))}
            className="mt-5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Sign out and try again
          </button>
        </div>
      </div>
    );
  }

  if (firebaseProfile.role === 'UNASSIGNED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-red-600" />
          <h1 className="text-lg font-bold text-slate-900">Unauthorized account</h1>
          <p className="mt-2 text-sm text-slate-600">
            This Firebase account has no trusted AquaTrack role. Contact an administrator to provision access.
          </p>
          <button
            type="button"
            onClick={() => signOutFirebase().catch(() => undefined)}
            className="mt-5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Firebase custom claims are the only active identity and role source.
  // Do not allow a locally cached staff PIN to switch the authenticated user.
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
        <h1 className="text-lg font-bold text-slate-900">Account authorized</h1>
        <p className="mt-2 text-sm text-slate-600">
          Continue with your trusted Firebase role: <strong>{firebaseProfile.roleTitle}</strong>.
        </p>
        <button
          type="button"
          onClick={() => onAuthenticated(firebaseProfile)}
          className="mt-5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
        >
          Open AquaTrack
        </button>
      </div>
    </div>
  );

  // =========================================================================
  // VIEW 2: FIREBASE AUTHENTICATED - NO STAFF CREATED YET
  // =========================================================================
  if (allUsers.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between font-sans antialiased">
        <header className="border-b border-red-100 bg-white px-4 md:px-8 py-3.5 shadow-xs">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-red-600 p-2.5 rounded-xl text-white">
                <Droplet className="h-6 w-6 fill-white" />
              </div>
              <div>
                <h1 className="text-lg font-black uppercase text-slate-900">
                  KFM Beverages <span className="text-red-600">(WARSA)</span>
                </h1>
                <p className="text-xs text-slate-500">
                  Authenticated: <strong className="text-slate-800">{auth.currentUser.email}</strong>
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Firebase Logged In
            </span>
          </div>
        </header>

        <main className="max-w-md mx-auto px-4 py-10 w-full flex-1 flex flex-col justify-center">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
              <ShieldCheck className="h-8 w-8" />
            </div>

            <span className="inline-block px-3 py-1 bg-red-50 text-red-700 font-black text-xs rounded-full uppercase tracking-wider border border-red-200">
              Super Administrator
            </span>

            <h2 className="text-xl font-black text-slate-900">
              Welcome to WARSA Plant System
            </h2>

            <p className="text-xs text-slate-600 leading-relaxed">
              No staff PIN account is assigned to this Firebase login yet.
            </p>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <Database className="h-3.5 w-3.5 text-red-600" />
                <span>Zero Default Credentials Active</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Ask a Super Administrator to create or assign your staff account and PIN before continuing.
              </p>
            </div>
          </div>
        </main>

        <footer className="text-center py-4 text-xs text-slate-400 border-t border-slate-100 bg-white">
          <span>KFM Beverages WARSA &bull; Enterprise Water Distribution Platform</span>
        </footer>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: FIREBASE AUTHENTICATED - SELECT CREATED STAFF ACCOUNT
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between font-sans antialiased">
      {/* Top Header */}
      <header className="border-b border-red-100 bg-white px-4 md:px-8 py-3.5 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2.5 rounded-xl text-white shadow-xs">
              <Droplet className="h-6 w-6 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black uppercase text-gray-900">
                  KFM Beverages <span className="text-red-600">(WARSA)</span>
                </h1>
                <span className="bg-red-100 text-red-700 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Terminal Mode
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Logged in via Firebase as: <strong className="text-slate-800">{auth.currentUser.email}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onAuthenticated(firebaseProfile)}
              className="text-xs font-bold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
            >
              Open Super Admin Session &rarr;
            </button>
          </div>
        </div>
      </header>

      {/* Staff User Selection Workspace */}
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-10 flex-1 flex flex-col justify-center w-full">
        <div className="mb-6">
          <div className="text-center mb-3">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
              Select Created Staff Account
            </h3>
            <p className="text-xs text-gray-500">
              Only accounts stored in Firebase Firestore appear here. Enter your 4-digit PIN or password to unlock your role.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-3xl mx-auto">
            {allUsers.map((user) => {
              const isSelected = selectedUser?.id === user.id;
              return (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer",
                    isSelected
                      ? "border-red-600 bg-white ring-2 ring-red-500/20 shadow-md scale-[1.02]"
                      : "border-slate-200 bg-white hover:border-slate-300 shadow-2xs"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-xs", user.avatarColor || 'bg-red-600')}>
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                      user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' ? "bg-red-600 text-white" : "bg-red-50 text-red-700 border border-red-200"
                    )}>
                      {user.role}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-900 truncate">
                      {user.name}
                    </h4>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">
                      {user.roleTitle}
                    </p>
                    {user.assignedRoute && (
                      <p className="text-[9px] text-red-700 truncate font-semibold mt-0.5">
                        📍 {user.assignedRoute.split('-')[0]}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-mono">ID: {user.username || user.id.slice(0, 8)}</span>
                    {isSelected && <span className="text-red-600 font-bold">Selected</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* PIN / Password Entry Pad */}
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl max-w-md mx-auto w-full",
              isShaking && "animate-shake"
            )}
          >
            <div className="text-center flex flex-col items-center">
              <div className={cn("w-14 h-14 rounded-2xl text-white font-black text-lg flex items-center justify-center shadow-md mb-2", selectedUser.avatarColor || 'bg-red-600')}>
                {selectedUser.name.slice(0, 2).toUpperCase()}
              </div>

              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full mb-1 border bg-red-50 text-red-700 border-red-200">
                {selectedUser.roleTitle}
              </span>

              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                {selectedUser.name}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {selectedUser.department} {selectedUser.assignedRoute ? `• ${selectedUser.assignedRoute}` : ''}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-slate-100 mt-4 mb-3">
              <button
                onClick={() => { setAuthMode('pin'); setErrorMessage(null); }}
                className={cn(
                  "flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                  authMode === 'pin' ? "border-red-600 text-red-600" : "border-transparent text-gray-400 hover:text-gray-700"
                )}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>4-Digit PIN Code</span>
              </button>
            </div>

            {/* Feedback */}
            <div className="h-5 my-1 flex items-center justify-center text-center">
              {errorMessage && (
                <span className="text-xs text-red-600 font-bold flex items-center gap-1 animate-in fade-in">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {errorMessage}
                </span>
              )}
              {isSuccess && (
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Verified! Opening session...
                </span>
              )}
            </div>

            {/* TAB 1: PIN Pad Entry */}
            {authMode === 'pin' && (
              <div>
                <div className="my-3 flex flex-col items-center">
                  <div className="flex items-center justify-center gap-3.5 py-1">
                    {[0, 1, 2, 3].map((index) => {
                      const isFilled = pinInput.length > index;
                      return (
                        <div
                          key={index}
                          className={cn(
                            "w-4 h-4 rounded-full border-2 transition-all duration-200 flex items-center justify-center",
                            isFilled
                              ? isSuccess 
                                ? "bg-emerald-500 border-emerald-400 scale-110 shadow-md"
                                : "bg-red-600 border-red-500 scale-110 shadow-md"
                              : "bg-slate-100 border-slate-300"
                          )}
                        >
                          {isFilled && showPinDigits && (
                            <span className="text-[10px] font-bold text-white">
                              {pinInput[index]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => handleKeyPress(digit)}
                      disabled={isSuccess}
                      className="h-11 rounded-xl bg-white hover:bg-red-600 hover:text-white active:bg-red-700 text-lg font-bold text-gray-800 border border-slate-200 hover:border-red-600 active:scale-95 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}

                  <button
                    onClick={handleClear}
                    disabled={isSuccess}
                    className="h-11 rounded-xl bg-white hover:bg-slate-50 text-xs font-bold text-gray-600 hover:text-red-700 border border-slate-200 active:scale-95 transition-all flex items-center justify-center uppercase cursor-pointer"
                  >
                    Clear
                  </button>

                  <button
                    onClick={() => handleKeyPress('0')}
                    disabled={isSuccess}
                    className="h-11 rounded-xl bg-white hover:bg-red-600 hover:text-white active:bg-red-700 text-lg font-bold text-gray-800 border border-slate-200 hover:border-red-600 active:scale-95 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                  >
                    0
                  </button>

                  <button
                    onClick={handleBackspace}
                    disabled={isSuccess}
                    className="h-11 rounded-xl bg-white hover:bg-slate-50 text-gray-600 hover:text-red-600 border border-slate-200 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-gray-400">
                  <button
                    onClick={() => setShowPinDigits(!showPinDigits)}
                    className="text-gray-500 hover:text-red-600 font-medium transition-colors text-[11px]"
                  >
                    {showPinDigits ? 'Hide PIN digits' : 'Show PIN digits'}
                  </button>
                  <span className="text-[11px]">Keyboard numbers 0-9</span>
                </div>
              </div>
            )}

            {/* TAB 2: Username & Password Entry */}
            {authMode === 'password' && (
              <form onSubmit={handleStaffPasswordSubmit} className="space-y-3.5 mt-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter staff username"
                    value={staffUsernameInput}
                    onChange={(e) => setStaffUsernameInput(e.target.value)}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showStaffPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter staff password"
                      value={staffPasswordInput}
                      onChange={(e) => setStaffPasswordInput(e.target.value)}
                      className="w-full h-10 px-3 pr-10 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPassword(!showStaffPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showStaffPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSuccess}
                  className="w-full h-11 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-red-600/20 flex items-center justify-center gap-2 mt-4 cursor-pointer"
                >
                  <span>Log In as {selectedUser.name}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}
          </motion.div>
        )}
      </main>

      <footer className="text-center py-4 text-xs text-slate-400 border-t border-slate-100 bg-white">
        <span>KFM Beverages WARSA &bull; Enterprise Water Distribution Platform</span>
      </footer>
    </div>
  );
}
