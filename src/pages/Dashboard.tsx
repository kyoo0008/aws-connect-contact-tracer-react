import React, { useState } from 'react';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  IconButton,
  InputAdornment,
  Alert,
  Chip,
  Stack,
  Divider,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import {
  Search as SearchIcon,
  PlayArrow as PlayIcon,
  History as HistoryIcon,
  CloudDownload as CloudIcon,
  Settings as SettingsIcon,
  Timeline as TimelineIcon,
  Phone as PhoneIcon,
  Person as PersonIcon,
  AccountTree as FlowIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { ContactDetails } from '@/types/contact.types';
import { useConfig } from '@/contexts/ConfigContext';
import {
  searchCustomer,
  searchAgent,
  searchContactFlow,
  searchDNIS,
  searchLambdaError,
  detectSearchType,
} from '@/services/searchService';

type SearchType = 'ContactId' | 'Customer' | 'Agent' | 'ContactFlow' | 'DNIS' | 'LambdaError' | 'History';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const [searchType, setSearchType] = useState<SearchType>('ContactId');
  const [searchValue, setSearchValue] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<ContactDetails[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Statistics query
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // This would be replaced with actual API call
      return {
        totalContacts: 1234,
        averageHandleTime: 245,
        todayContacts: 89,
        activeAgents: 12,
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleSearch = async () => {
    // Validation
    if (searchType !== 'LambdaError' && searchType !== 'History') {
      if (!searchValue.trim()) {
        setSearchError(`Please enter a ${searchType}`);
        return;
      }
    }

    // Check config
    if (!config.credentials) {
      setSearchError('Please configure AWS credentials in Settings first');
      return;
    }

    // Add to recent searches
    if (searchValue) {
      setRecentSearches(prev => {
        const updated = [searchValue, ...prev.filter(val => val !== searchValue)];
        return updated.slice(0, 5);
      });
    }

    setSearchError(null);

    // For ContactId, navigate directly
    if (searchType === 'ContactId') {
      navigate(`/contact-flow/${searchValue}`);
      return;
    }

    // For History, show placeholder message
    if (searchType === 'History') {
      setSearchError('History feature will be implemented to show previously viewed contact flows.');
      return;
    }

    // For other types, call backend API
    try {
      setSearchResults([]);

      let result;
      // Extract instance alias from logGroupName (e.g., '/aws/connect/kal-servicecenter-dev' -> 'kal-servicecenter-dev')
      const instanceAlias = config.logGroupName?.replace('/aws/connect/', '') || 'kal-servicecenter';

      switch (searchType) {
        case 'Customer': {
          const detectedType = detectSearchType(searchValue, 'Customer');
          if (detectedType === 'unknown') {
            setSearchError('Invalid customer search value. Use Phone Number (E.164), 32-char Profile ID, or 12-char Skypass Number');
            return;
          }
          result = await searchCustomer(searchValue, detectedType as 'phone' | 'profileId' | 'skypass', config);
          break;
        }

        case 'Agent': {
          const detectedType = detectSearchType(searchValue, 'Agent') as 'uuid' | 'email' | 'name';
          result = await searchAgent(searchValue, detectedType, config);
          break;
        }

        case 'ContactFlow': {
          result = await searchContactFlow(searchValue, config, instanceAlias);
          break;
        }

        case 'DNIS': {
          result = await searchDNIS(searchValue, config, instanceAlias);
          break;
        }

        case 'LambdaError': {
          result = await searchLambdaError(config);
          break;
        }

        default:
          setSearchError('Unknown search type');
          return;
      }

      // Convert search results to ContactDetails format
      const contactDetails: ContactDetails[] = result.contacts.map(contact => ({
        contactId: contact.contactId,
        instanceId: config.instanceId,
        initiationTimestamp: contact.initiationTimestamp || contact.timestamp || new Date().toISOString(),
        channel: contact.channel || 'UNKNOWN',
        contactFlowName: searchType,
      }));

      setSearchResults(contactDetails);

      if (contactDetails.length === 0) {
        setSearchError('No contacts found for the given search criteria');
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError((error as Error).message || 'Failed to search. Make sure the backend server is running (npm run server)');
    }
  };

  const handleRecentSearch = (id: string) => {
    setSearchValue(id);
    navigate(`/contact-flow/${id}`);
  };

  const getSearchPlaceholder = (): string => {
    switch (searchType) {
      case 'ContactId':
        return 'Enter Contact ID (UUID)';
      case 'Customer':
        return 'Enter Phone Number (+821012341234), Customer Profile ID, or Skypass Number';
      case 'Agent':
        return 'Enter Agent ID, Name, or Email';
      case 'ContactFlow':
        return 'Enter Contact Flow Name (e.g., 05_CustomerQueue)';
      case 'DNIS':
        return 'Enter DNIS (e.g., +82269269240)';
      case 'LambdaError':
        return 'Search for Lambda errors in the last 48 hours';
      case 'History':
        return 'View saved contact flow history';
      default:
        return 'Enter search value';
    }
  };

  const getSearchHelperText = (): string => {
    switch (searchType) {
      case 'ContactId':
        return 'UUID format required';
      case 'Customer':
        return 'Phone Number (E.164), 32-char Profile ID, or 12-char Skypass Number';
      case 'Agent':
        return 'UUID, Full Name (한글/영문), or Email format';
      case 'ContactFlow':
        return 'Case-sensitive flow name';
      case 'DNIS':
        return 'E.164 format (e.g., +82269269240)';
      case 'LambdaError':
        return 'Automatically searches CloudWatch Logs for errors';
      case 'History':
        return 'Shows previously searched contact flows';
      default:
        return '';
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        AWS Connect Contact Tracer
      </Typography>

      {/* Quick Search Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Advanced Search
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Search Type</InputLabel>
                <Select
                  value={searchType}
                  label="Search Type"
                  onChange={(e: SelectChangeEvent) => {
                    setSearchType(e.target.value as SearchType);
                    setSearchValue('');
                  }}
                >
                  <MenuItem value="ContactId">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <SearchIcon fontSize="small" />
                      <span>Contact ID</span>
                    </Stack>
                  </MenuItem>
                  <MenuItem value="Customer">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PersonIcon fontSize="small" />
                      <span>Customer</span>
                    </Stack>
                  </MenuItem>
                  <MenuItem value="Agent">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PersonIcon fontSize="small" />
                      <span>Agent</span>
                    </Stack>
                  </MenuItem>
                  <MenuItem value="ContactFlow">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FlowIcon fontSize="small" />
                      <span>Contact Flow</span>
                    </Stack>
                  </MenuItem>
                  <MenuItem value="DNIS">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <PhoneIcon fontSize="small" />
                      <span>DNIS</span>
                    </Stack>
                  </MenuItem>
                  <MenuItem value="LambdaError">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <ErrorIcon fontSize="small" />
                      <span>Lambda Error</span>
                    </Stack>
                  </MenuItem>
                  <MenuItem value="History">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <HistoryIcon fontSize="small" />
                      <span>History</span>
                    </Stack>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder={getSearchPlaceholder()}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                helperText={getSearchHelperText()}
                disabled={searchType === 'LambdaError' || searchType === 'History'}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleSearch}
                startIcon={<PlayIcon />}
              >
                Search
              </Button>
            </Grid>
          </Grid>

          {/* Search Error */}
          {searchError && (
            <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setSearchError(null)}>
              {searchError}
            </Alert>
          )}

          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="textSecondary">
                Recent Searches:
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                {recentSearches.map((id) => (
                  <Chip
                    key={id}
                    label={id}
                    onClick={() => handleRecentSearch(id)}
                    icon={<HistoryIcon />}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="hover-card">
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Contacts
              </Typography>
              <Typography variant="h4">
                {stats?.totalContacts || '-'}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Last 24 hours
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="hover-card">
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Avg Handle Time
              </Typography>
              <Typography variant="h4">
                {stats?.averageHandleTime ? `${Math.floor(stats.averageHandleTime / 60)}:${(stats.averageHandleTime % 60).toString().padStart(2, '0')}` : '-'}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Minutes
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="hover-card">
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Today's Contacts
              </Typography>
              <Typography variant="h4">
                {stats?.todayContacts || '-'}
              </Typography>
              <Typography variant="caption" color="success.main">
                +12% from yesterday
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card className="hover-card">
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Agents
              </Typography>
              <Typography variant="h4">
                {stats?.activeAgents || '-'}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Currently online
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Search Results ({searchResults.length})
          </Typography>
          <Grid container spacing={2}>
            {searchResults.map((contact) => (
              <Grid item xs={12} key={contact.contactId}>
                <Card
                  sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                  onClick={() => navigate(`/contact-flow/${contact.contactId}`)}
                >
                  <CardContent>
                    <Typography variant="body1" component="div">
                      <strong>Contact ID:</strong> {contact.contactId}
                    </Typography>
                    <Typography color="text.secondary">
                      <strong>Flow Name:</strong> {contact.contactFlowName || 'N/A'}
                    </Typography>
                    <Typography color="text.secondary">
                      <strong>Initiation:</strong> {dayjs(contact.initiationTimestamp).format('YYYY-MM-DD HH:mm:ss')}
                    </Typography>
                    <Chip label={contact.channel} size="small" sx={{ mt: 1 }} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Quick Actions */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Quick Actions
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              sx={{
                p: 2,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => navigate('/logs')}
            >
              <TimelineIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ mt: 1 }}>
                View Logs
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              sx={{
                p: 2,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => navigate('/contact-flow')}
            >
              <CloudIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ mt: 1 }}>
                Flow Viewer
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              sx={{
                p: 2,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => window.open('/api/export', '_blank')}
            >
              <CloudIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ mt: 1 }}>
                Export Data
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              sx={{
                p: 2,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => navigate('/settings')}
            >
              <SettingsIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              <Typography variant="subtitle1" sx={{ mt: 1 }}>
                Settings
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="subtitle2">
          <strong>Tip:</strong> You can use Contact ID from AWS Connect to trace the complete flow, 
          including all module executions, Lambda invocations, and customer interactions.
        </Typography>
      </Alert>
    </Container>
  );
};

export default Dashboard;
