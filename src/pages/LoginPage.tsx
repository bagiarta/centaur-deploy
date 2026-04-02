import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Server, Lock, User as UserIcon, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        login(data.user);
        navigate("/");
      } else {
        setError(data.error || "Login failed. Please check your credentials.");
      }
    } catch (err) {
      setError("Server connection failed. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0c] relative overflow-hidden font-sans">
      {/* Background blobs for aesthetic */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse-slow active"></div>

      <div className="w-full max-w-md p-8 relative z-10 animate-fade-in-up">
        {/* Branding */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-glow mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">PepiNetUpdater</h1>
          <p className="text-foreground-muted text-sm mt-2">Enterprise Deployment Management</p>
        </div>

        {/* Login Card */}
        <div className="bg-surface/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-4">
              <div className="relative">
                <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider ml-1 mb-1.5 block">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/20 outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="text-xs font-bold text-foreground-muted uppercase tracking-wider ml-1 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/20 outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-danger/10 border border-danger/20 rounded-xl p-3 flex items-center gap-3 animate-shake">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <p className="text-xs text-danger font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-glow flex items-center justify-center gap-2",
                isLoading 
                  ? "bg-muted text-foreground-muted cursor-not-allowed" 
                  : "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.98] hover:shadow-primary/30"
              )}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In to Console"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center mt-8 text-foreground-muted text-xs">
          &copy; {new Date().getFullYear()} PepiNet. Secure Console Access.
        </p>
      </div>
    </div>
  );
}
