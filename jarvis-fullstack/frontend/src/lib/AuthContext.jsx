import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api/Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const navigate = useNavigate();

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      return false;
    }
    try {
      const res = await api.get('/api/auth/me');
      setUser(res.data);
      setIsAuthenticated(true);
      return true;
    } catch {
      localStorage.removeItem('access_token');
      setUser(null);
      setIsAuthenticated(false);
      return false;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    try {
      const res = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('access_token', res.data.access_token);
      const ok = await refreshUser();
      if (ok) {
        // First-login experience: bounce to the animated /welcome page.
        // After they see it (or skip), they're flipped to welcome_seen
        // and future logins go straight to /chat.
        try {
          const me = await api.get('/api/auth/me');
          if (!me.data?.welcome_seen) {
            navigate('/welcome', { replace: true });
          } else {
            navigate('/chat', { replace: true });
          }
        } catch {
          navigate('/chat', { replace: true });
        }
      }
      return { success: true };
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed';
      const status = err.response?.status;
      return { success: false, error: msg, status };
    }
  };

  const register = async ({ email, password, full_name, username }) => {
    try {
      await api.post('/api/auth/register', { email, password, full_name, username });
      return await login(email, password);
    } catch (err) {
      const detail = err.response?.data?.detail;
      // Pydantic 422 errors come back as a list of {loc, msg}
      let msg;
      if (Array.isArray(detail)) {
        msg = detail.map((d) => d.msg).join(', ');
      } else {
        msg = detail || 'Registration failed';
      }
      return { success: false, error: msg };
    }
  };

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    setUser(null);
    setIsAuthenticated(false);
    // replace ensures the browser Back button can't return to authed pages
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, isLoadingAuth, login, register, logout, refreshUser, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
