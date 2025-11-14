import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AWSConfig } from '@/types/contact.types';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  awsCredentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  updateCredentials: (credentials: Partial<AWSConfig['credentials']>) => void;
}

interface LoginCredentials {
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth token
    const checkAuth = async () => {
      try {
        const storedAuth = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('user_data');
        
        if (storedAuth && storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      // In production, this would be an API call
      // For demo purposes, we'll simulate a login
      const mockUser: User = {
        id: '1',
        name: credentials.email.split('@')[0],
        email: credentials.email,
        role: 'admin',
      };

      // Store auth data
      localStorage.setItem('auth_token', 'mock_token_' + Date.now());
      localStorage.setItem('user_data', JSON.stringify(mockUser));
      
      setUser(mockUser);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    setUser(null);
  };

  const updateCredentials = (credentials: Partial<AWSConfig['credentials']>) => {
    if (user) {
      setUser({
        ...user,
        awsCredentials: {
          ...user.awsCredentials,
          ...credentials,
        } as any,
      });
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    updateCredentials,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
