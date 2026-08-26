import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertCircle, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleSSOLogin = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/sso-config");
      if (!res.ok) {
        throw new Error("Failed to load SSO configuration");
      }
      const config = await res.json();
      if (!config.auth_url || !config.client_id || !config.redirect_uri) {
        throw new Error("SSO config is incomplete");
      }

      // Generate a CSRF state token and store it for verification on callback
      const state = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem("sso_state", state);

      const ssoUrl = `${config.auth_url}?client_id=${config.client_id}&redirect_uri=${encodeURIComponent(config.redirect_uri)}&response_type=code&scope=openid profile email&state=${state}`;
      window.location.href = ssoUrl;
    } catch (err: any) {
      setError(err.message || "Unable to connect to SSO Server.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0c] relative overflow-hidden font-sans">
      {/* Background blobs for aesthetic */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse-slow active"></div>

      <div className="w-full max-w-md px-4 sm:px-8 py-8 relative z-10 animate-fade-in-up">
        {/* Branding */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-4 group transform transition-all duration-500 hover:scale-110">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <img
              src="/pepi-logo.png"
              alt="PepiNet Logo"
              className="w-24 h-auto relative z-10 drop-shadow-2xl"
            />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">PepiNetUpdater</h1>
          <p className="text-foreground-muted text-sm mt-2 text-center">Tools Management & Monitoring</p>
        </div>

        {/* Login Card */}
        <div className="bg-surface/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>

          <div className="space-y-6 relative z-10 text-center">

            <p className="text-sm text-foreground-muted mb-6">
              Authentication is managed centrally via SSO. Please log in using your corporate credentials.
            </p>

            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-center gap-3 animate-shake text-left">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <p className="text-xs text-danger font-medium">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSSOLogin}
              disabled={isLoading}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-sm transition-all shadow-glow flex items-center justify-center gap-2",
                isLoading
                  ? "bg-muted text-foreground-muted cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.98] hover:shadow-primary/30"
              )}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
              LOGIN WITH SSO
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-foreground-muted text-xs">
          &copy; {new Date().getFullYear()} 死神.
        </p>
      </div>
    </div>
  );
}

