import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

// Pages
import Dashboard from './pages/Dashboard';
import ContactFlowViewer from './pages/ContactFlowViewer';
import FlowDetailViewer from './pages/FlowDetailViewer';
import ModuleDetailViewer from './pages/ModuleDetailViewer';
import LogAnalysis from './pages/LogAnalysis';
import Settings from './pages/Settings';
import XRayTraceViewer from './pages/XRayTraceViewer';
import QMAutomationList from './pages/QMAutomationList';
import QMAutomationDetail from './pages/QMAutomationDetail';
import QMEvaluationFormList from './pages/QMEvaluationFormList';
import QMEvaluationFormDetail from './pages/QMEvaluationFormDetail';
import Help from './pages/Help';

// Components
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

// Contexts
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider } from './contexts/ConfigContext';

const role = process.env.REACT_APP_ROLE || 'ADMIN';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 3,
      refetchOnWindowFocus: false,
    },
  },
});

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#FF9900', // AWS Orange
      light: '#FFB84D',
      dark: '#CC7A00',
    },
    secondary: {
      main: '#232F3E', // AWS Dark Blue
      light: '#37475A',
      dark: '#161E2D',
    },
    background: {
      default: '#F5F5F5',
      paper: '#FFFFFF',
    },
    error: {
      main: '#D13212',
    },
    success: {
      main: '#037F0C',
    },
    info: {
      main: '#0073BB',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 600,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 4,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          borderRadius: 6,
        },
        filled: {
          backgroundColor: '#F5F5F5',
          color: '#616161',
          '&:hover': {
            backgroundColor: '#EEEEEE',
          },
          '&.MuiChip-colorPrimary': {
            backgroundColor: '#FFF4E5',
            color: '#663C00',
            '&:hover': {
              backgroundColor: '#FFEAD2',
            },
          },
          '&.MuiChip-colorSecondary': {
            backgroundColor: '#E8EAF6',
            color: '#1A237E',
            '&:hover': {
              backgroundColor: '#D1D9FF',
            },
          },
          '&.MuiChip-colorError': {
            backgroundColor: '#FFEBEE',
            color: '#B71C1C',
            '&:hover': {
              backgroundColor: '#FFD1D1',
            },
          },
          '&.MuiChip-colorSuccess': {
            backgroundColor: '#E8F5E9',
            color: '#1B5E20',
            '&:hover': {
              backgroundColor: '#D8ECDA',
            },
          },
          '&.MuiChip-colorInfo': {
            backgroundColor: '#E3F2FD',
            color: '#0D47A1',
            '&:hover': {
              backgroundColor: '#D1E9FF',
            },
          },
          '&.MuiChip-colorWarning': {
            backgroundColor: '#FFF3E0',
            color: '#E65100',
            '&:hover': {
              backgroundColor: '#FFE0B2',
            },
          },
        },
        outlined: {
          '&.MuiChip-colorPrimary': {
            borderColor: '#FFB84D',
            color: '#CC7A00',
            backgroundColor: 'rgba(255, 184, 77, 0.04)',
          },
          '&.MuiChip-colorSuccess': {
            borderColor: '#81C784',
            color: '#2E7D32',
            backgroundColor: 'rgba(129, 199, 132, 0.08)',
          },
          '&.MuiChip-colorError': {
            borderColor: '#E57373',
            color: '#C62828',
            backgroundColor: 'rgba(229, 115, 115, 0.08)',
          },
          '&.MuiChip-colorInfo': {
            borderColor: '#64B5F6',
            color: '#1565C0',
            backgroundColor: 'rgba(100, 181, 246, 0.08)',
          },
          '&.MuiChip-colorWarning': {
            borderColor: '#FFB74D',
            color: '#EF6C00',
            backgroundColor: 'rgba(255, 183, 77, 0.08)',
          },
        },
      },
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <AuthProvider>
              <ConfigProvider>
                <Router>
                  <Layout>
                    <Routes>
                      <Route path="/" element={role === 'QA_DEV' ? <QMAutomationList /> : <Dashboard />} />
                      <Route path="/contact-flow/:contactId?" element={<ContactFlowViewer />} />
                      <Route path="/contact-flow/:contactId/flow/:flowName" element={<FlowDetailViewer />} />
                      <Route path="/contact-flow/:contactId/flow/:flowName/module/:moduleName" element={<ModuleDetailViewer />} />
                      <Route path="/qm-automation" element={<QMAutomationList />} />
                      <Route path="/qm-automation/detail/:requestId" element={<QMAutomationDetail />} />
                      <Route path="/qm-evaluation-form" element={<QMEvaluationFormList />} />
                      <Route path="/qm-evaluation-form/:formId" element={<QMEvaluationFormDetail />} />
                      <Route path="/logs/:contactId?" element={<LogAnalysis />} />
                      <Route path="/xray-trace" element={<XRayTraceViewer />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/help" element={<Help />} />
                    </Routes>
                  </Layout>
                </Router>
              </ConfigProvider>
            </AuthProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
