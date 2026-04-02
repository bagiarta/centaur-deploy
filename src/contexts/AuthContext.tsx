import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: string;
  username: string;
  full_name: string;
  role_id: string;
  role_name: string;
  menu_permissions: string; // JSON or '*'
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  loading: boolean;
  hasPermission: (menuKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem("pepi_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem("pepi_user", JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("pepi_user");
  };

  const hasPermission = (menuKey: string) => {
    if (!user) return false;
    if (user.is_admin || user.menu_permissions === "*") return true;
    try {
      const perms = JSON.parse(user.menu_permissions);
      return Array.isArray(perms) && perms.includes(menuKey);
    } catch (e) {
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
