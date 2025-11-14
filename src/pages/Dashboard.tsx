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
} from '@mui/material';
import {
  Search as SearchIcon,
  PlayArrow as PlayIcon,
  History as HistoryIcon,
  CloudDownload as CloudIcon,
  Settings as SettingsIcon,
  Timeline as TimelineIcon,
  Phone as PhoneIcon,
  Chat as ChatIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { useNavigate } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { getAWSConnectService } from '@/services/awsConnectService';
import { ContactDetails, SearchCriteria } from '@/types/contact.types';
import { useConfig } from '@/contexts/ConfigContext';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const [contactId, setContactId] = useState('');
  const [startTime, setStartTime] = useState<Dayjs | null>(dayjs().subtract(1, 'day'));
  const [endTime, setEndTime] = useState<Dayjs | null>(dayjs());
  const [selectedChannel, setSelectedChannel] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<ContactDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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

  const handleSearch = () => {
    if (!contactId.trim()) {
      alert('Please enter a Contact ID');
      return;
    }

    // Add to recent searches
    setRecentSearches(prev => {
      const updated = [contactId, ...prev.filter(id => id !== contactId)];
      return updated.slice(0, 5); // Keep only 5 recent searches
    });

    // Navigate to contact flow viewer
    navigate(`/contact-flow/${contactId}`);
  };

  const handleAdvancedSearch = async () => {
    const criteria: SearchCriteria = {
      startTime: startTime?.toDate(),
      endTime: endTime?.toDate(),
      channel: selectedChannel.length > 0 ? selectedChannel : undefined,
    };

    setIsSearching(true);
    setSearchError(null);

    try {
      const service = getAWSConnectService(config);
      const results = await service.searchContacts(criteria);
      setSearchResults(results);
    } catch (error) {
      setSearchError((error as Error).message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleChannelToggle = (channel: string) => {
    setSelectedChannel(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const handleRecentSearch = (id: string) => {
    setContactId(id);
    navigate(`/contact-flow/${id}`);
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
            Quick Search
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Enter Contact ID"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="contained"
              size="large"
              onClick={handleSearch}
              startIcon={<PlayIcon />}
            >
              Trace
            </Button>
          </Box>

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

      {/* Advanced Search */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Advanced Search
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <DateTimePicker
                label="Start Time"
                value={startTime}
                onChange={setStartTime}
                slotProps={{
                  textField: {
                    fullWidth: true,
                  },
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <DateTimePicker
                label="End Time"
                value={endTime}
                onChange={setEndTime}
                slotProps={{
                  textField: {
                    fullWidth: true,
                  },
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Channel
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  icon={<PhoneIcon />}
                  label="Voice"
                  onClick={() => handleChannelToggle('VOICE')}
                  color={selectedChannel.includes('VOICE') ? 'primary' : 'default'}
                  variant={selectedChannel.includes('VOICE') ? 'filled' : 'outlined'}
                />
                <Chip
                  icon={<ChatIcon />}
                  label="Chat"
                  onClick={() => handleChannelToggle('CHAT')}
                  color={selectedChannel.includes('CHAT') ? 'primary' : 'default'}
                  variant={selectedChannel.includes('CHAT') ? 'filled' : 'outlined'}
                />
                <Chip
                  icon={<EmailIcon />}
                  label="Task"
                  onClick={() => handleChannelToggle('TASK')}
                  color={selectedChannel.includes('TASK') ? 'primary' : 'default'}
                  variant={selectedChannel.includes('TASK') ? 'filled' : 'outlined'}
                />
              </Stack>
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                fullWidth
                onClick={handleAdvancedSearch}
                startIcon={<SearchIcon />}
                disabled={isSearching}
              >
                {isSearching ? 'Searching...' : 'Search Contacts'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Search Results */}
      <Box sx={{ mt: 3 }}>
        {isSearching && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress />
          </Box>
        )}
        {searchError && (
          <Alert severity="error" sx={{ my: 2 }}>
            {searchError}
          </Alert>
        )}
        {searchResults.length > 0 && (
          <Typography variant="h6" gutterBottom>
            Search Results ({searchResults.length})
          </Typography>
        )}
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
