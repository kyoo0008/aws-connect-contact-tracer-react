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

// Components
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

// Contexts
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider } from './contexts/ConfigContext';

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
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/contact-flow/:contactId?" element={<ContactFlowViewer />} />
                      <Route path="/contact-flow/:contactId/flow/:flowName" element={<FlowDetailViewer />} />
                      <Route path="/contact-flow/:contactId/flow/:flowName/module/:moduleName" element={<ModuleDetailViewer />} />
                      <Route path="/qm-automation/:contactId?" element={<QMAutomationList />} />
                      <Route path="/qm-automation/:contactId/detail/:requestId" element={<QMAutomationDetail />} />
                      <Route path="/logs/:contactId?" element={<LogAnalysis />} />
                      <Route path="/xray-trace" element={<XRayTraceViewer />} />
                      <Route path="/settings" element={<Settings />} />
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
