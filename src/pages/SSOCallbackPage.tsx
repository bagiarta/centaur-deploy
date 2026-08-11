import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function SSOCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedRef = React.useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");

    if (!code) {
      setError("No authorization code found in callback URL.");
      return;
    }

    // Verify CSRF state token
    const savedState = sessionStorage.getItem("sso_state");
    if (returnedState && savedState && returnedState !== savedState) {
      setError("SSO state mismatch. Possible CSRF attack. Please try logging in again.");
      return;
    }
    // Clear state after use
    sessionStorage.removeItem("sso_state");

    if (processedRef.current) return;
    processedRef.current = true;

    const processLogin = async () => {
      try {
        const res = await fetch("/api/auth/sso-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "SSO Authentication failed");
        }

        const data = await res.json();
        if (data.success && data.user) {
          login(data.user);
          toast.success(`Welcome back, ${data.user.full_name || data.user.username}!`);
          navigate("/");
        } else {
          throw new Error("Invalid response from login server");
        }
      } catch (err: any) {
        console.error("SSO Callback Error:", err);
        setError(err.message || "Failed to log in with SSO.");
        toast.error("SSO Login failed.");
      }
    };

    processLogin();
  }, [searchParams, login, navigate]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0a0a0c] text-white p-6 font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]"></div>

      <div className="w-full max-w-md p-8 bg-surface/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center relative z-10">
        <img
          src="/pepi-logo.png"
          alt="PepiNet Logo"
          className="w-16 h-auto mb-6 drop-shadow-2xl"
        />

        {error ? (
          <div className="text-center space-y-4 w-full">
            <div className="mx-auto w-12 h-12 bg-danger/10 text-danger rounded-full flex items-center justify-center border border-danger/20 mb-4 animate-shake">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">SSO Login Failed</h2>
            <p className="text-sm text-foreground-muted">{error}</p>
            <button
              onClick={() => navigate("/login")}
              className="mt-4 px-6 py-2.5 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white">Authenticating...</h2>
            <p className="text-sm text-foreground-muted">Completing Single Sign-On. Please wait.</p>
          </div>
        )}
      </div>
    </div>
  );
}
