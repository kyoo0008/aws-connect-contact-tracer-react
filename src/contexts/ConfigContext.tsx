import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AWSConfig } from '@/types/contact.types';

interface ConfigContextType {
  config: AWSConfig;
  updateConfig: (updates: Partial<AWSConfig>) => void;
  resetConfig: () => void;
  isConfigured: boolean;
}

const DEFAULT_CONFIG: AWSConfig = {
  region: 'ap-northeast-2',
  instanceId: '',
  environment: 'prd',
  logGroupName: '/aws/connect/kal-servicecenter',
  s3BucketPrefix: 'aicc', // Kept for backward compatibility but will be removed from UI
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

interface ConfigProviderProps {
  children: ReactNode;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<AWSConfig>(() => {
    // Load config from localStorage
    const stored = localStorage.getItem('aws_config');
    if (stored) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    // Save config to localStorage whenever it changes
    localStorage.setItem('aws_config', JSON.stringify(config));
  }, [config]);

  const updateConfig = (updates: Partial<AWSConfig>) => {
    setConfig(prev => ({
      ...prev,
      ...updates,
    }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem('aws_config');
  };

  const isConfigured = !!(
    config.instanceId &&
    config.region &&
    config.environment
  );

  const value: ConfigContextType = {
    config,
    updateConfig,
    resetConfig,
    isConfigured,
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

export default ConfigContext;
