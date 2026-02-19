import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Alert,
  CircularProgress,
  Autocomplete,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useConfig } from '@/contexts/ConfigContext';
import {
  fetchSSOCredentials,
  getCredentialsFromEnv,
  autoFetchSSOCredentials,
  fetchSSOProfiles,
  AWSSSOProfile,
} from '@/services/credentialService';
import { getProfileMapping, isProfileMapped } from '@/config/profileMappings';

const Settings: React.FC = () => {
  const { config, updateConfig, resetConfig } = useConfig();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [ssoProfiles, setSsoProfiles] = useState<AWSSSOProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [newFilterKeyword, setNewFilterKeyword] = useState('');

  const handleAddFilterKeyword = () => {
    const keyword = newFilterKeyword.trim();
    if (!keyword) return;
    const current = config.qmFlowLogFilterKeywords || [];
    if (current.includes(keyword)) {
      setNewFilterKeyword('');
      return;
    }
    updateConfig({ qmFlowLogFilterKeywords: [...current, keyword] });
    setNewFilterKeyword('');
  };

  const handleRemoveFilterKeyword = (index: number) => {
    const current = config.qmFlowLogFilterKeywords || [];
    updateConfig({ qmFlowLogFilterKeywords: current.filter((_, i) => i !== index) });
  };

  const isMappedProfile = useMemo(() => {
    return isProfileMapped(config.profile || '');
  }, [config.profile]);

  const profileMapping = useMemo(() => {
    return getProfileMapping(config.profile || '');
  }, [config.profile]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    resetConfig();
    setError(null);
  };

  const handleFetchSSOCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const credentials = await fetchSSOCredentials(config.profile);
      const mapping = getProfileMapping(config.profile || '');
      updateConfig({
        credentials,
        ...(mapping && {
          region: mapping.region,
          instanceId: mapping.instanceId,
          environment: mapping.environment,
          logGroupName: mapping.logGroupName,
        }),
      });
      flashSaved();
    } catch (err: any) {
      setError(err.message || 'SSO 자격 증명을 가져오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadEnvCredentials = () => {
    const credentials = getCredentialsFromEnv();
    if (credentials) {
      updateConfig({ credentials });
      flashSaved();
    } else {
      setError('환경 변수에서 자격 증명을 찾을 수 없습니다.');
    }
  };

  // Load SSO profiles and auto-fetch credentials on component mount
  useEffect(() => {
    const autoLoad = async () => {
      setLoading(true);
      setLoadingProfiles(true);
      setWarning(null);

      try {
        const profiles = await fetchSSOProfiles();
        setSsoProfiles(profiles);

        // 이미 선택된 프로필이 있으면 해당 프로필만 자격증명 가져오기
        if (config.profile) {
          const selectedProfile = profiles.find(p => p.name === config.profile);
          if (selectedProfile?.isLoggedIn) {
            const credentials = await fetchSSOCredentials(selectedProfile.name);
            const mapping = getProfileMapping(selectedProfile.name);
            updateConfig({
              credentials,
              region: mapping?.region || selectedProfile.region,
              ...(mapping && {
                instanceId: mapping.instanceId,
                environment: mapping.environment,
                logGroupName: mapping.logGroupName,
              }),
            });
            flashSaved();
          } else if (selectedProfile) {
            // setWarning(`선택된 프로필 "${config.profile}"이 로그인되어 있지 않습니다. "aws sso login --profile ${config.profile}"을 실행하세요.`);
          }
        } else {
          // 선택된 프로필이 없으면 로그인된 첫 번째 프로필 사용
          const loggedInProfiles = profiles.filter(p => p.isLoggedIn);

          if (loggedInProfiles.length > 0) {
            const targetProfile = loggedInProfiles[0];
            const credentials = await fetchSSOCredentials(targetProfile.name);
            const mapping = getProfileMapping(targetProfile.name);

            updateConfig({
              credentials,
              profile: targetProfile.name,
              region: mapping?.region || targetProfile.region,
              ...(mapping && {
                instanceId: mapping.instanceId,
                environment: mapping.environment,
                logGroupName: mapping.logGroupName,
              }),
            });
            flashSaved();
          } else if (profiles.length > 0) {
            setWarning(`AWS SSO 프로필이 ${profiles.length}개 발견되었지만 로그인되어 있지 않습니다. 아래에서 프로필을 선택 후 "aws sso login --profile <profile>"을 실행하세요.`);
          } else {
            const ssoData = await autoFetchSSOCredentials();
            if (ssoData) {
              updateConfig({
                credentials: ssoData.credentials,
                profile: ssoData.profile,
                region: ssoData.region,
              });
            }
          }
        }
      } catch (err) {
        // Silent fail
      } finally {
        setLoading(false);
        setLoadingProfiles(false);
      }
    };

    autoLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        AWS 설정
      </Typography>

      {/* {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          설정이 저장되었습니다.
        </Alert>
      )} */}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {warning && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setWarning(null)}>
          {warning}
        </Alert>
      )}

      <Paper sx={{ p: 3, maxWidth: 800 }}>
        <Stack spacing={3}>
          <Typography variant="h6" sx={{ mt: 2 }}>
            인증 설정
          </Typography>

          <Stack direction="column" spacing={1}>
            {loadingProfiles ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">SSO 프로필 로딩 중...</Typography>
              </Box>
            ) : ssoProfiles.length > 0 ? (
              <Autocomplete
                options={ssoProfiles}
                getOptionLabel={(option) => option.name}
                value={ssoProfiles.find(p => p.name === config.profile) || null}
                onChange={async (event, newValue) => {
                  if (newValue) {
                    const mapping = getProfileMapping(newValue.name);

                    // 프로필 및 매핑 정보 즉시 반영
                    updateConfig({
                      profile: newValue.name,
                      region: mapping?.region || newValue.region,
                      ...(mapping && {
                        instanceId: mapping.instanceId,
                        environment: mapping.environment,
                        logGroupName: mapping.logGroupName,
                      }),
                    });

                    // 로그인된 프로필이면 자격증명도 가져오기
                    if (newValue.isLoggedIn) {
                      setLoading(true);
                      try {
                        const credentials = await fetchSSOCredentials(newValue.name);
                        updateConfig({ credentials });
                        flashSaved();
                      } catch (err) {
                        setError('자격 증명을 가져오는데 실패했습니다.');
                      } finally {
                        setLoading(false);
                      }
                    }
                  }
                }}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body1">{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.region} • {option.sso_account_id}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: option.isLoggedIn ? 'success.main' : 'error.main',
                          ml: 1,
                        }}
                        title={option.isLoggedIn ? '로그인됨' : '로그인 필요'}
                      />
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="AWS SSO Profile"
                    helperText={
                      config.profile
                        ? ssoProfiles.find(p => p.name === config.profile)?.isLoggedIn
                          ? '✓ 로그인됨'
                          : '⚠ 로그인 필요: aws sso login --profile ' + config.profile
                        : '프로필을 선택하세요'
                    }
                  />
                )}
              />
            ) : (
              <TextField
                label="AWS SSO Profile"
                value={config.profile || ''}
                onChange={(e) => updateConfig({ profile: e.target.value })}
                fullWidth
                helperText="SSO 프로필이 발견되지 않았습니다. 직접 입력하세요."
              />
            )}
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              onClick={handleFetchSSOCredentials}
              disabled={loading || !config.profile}
            >
              {loading ? <CircularProgress size={24} /> : 'SSO 자격 증명 가져오기'}
            </Button>
            <Button
              variant="outlined"
              onClick={handleLoadEnvCredentials}
              disabled={loading}
            >
              환경 변수에서 가져오기
            </Button>
          </Stack>

          {config.credentials && (
            <Alert severity="success" sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>자격 증명 로드됨</strong>
                <br />
                Access Key: {config.credentials.accessKeyId.substring(0, 8)}...
                {config.credentials.expiration && (
                  <>
                    <br />
                    만료: {new Date(config.credentials.expiration).toLocaleString()}
                  </>
                )}
              </Typography>
            </Alert>
          )}

          {isMappedProfile && profileMapping && (
            <Alert severity="success" sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>환경 자동 설정됨:</strong> 프로필에 "{profileMapping.keyword}"가 포함되어 있어 {profileMapping.environment.toUpperCase()} 환경으로 자동 설정되었습니다.
              </Typography>
            </Alert>
          )}

          <Alert severity="info">
            <Typography variant="body2">
              <strong>자동 설정 안내:</strong>
              <br />
              • 페이지 로드 시 로컬 PC의 SSO 프로필을 자동으로 검색합니다.
              <br />
              • AWS SSO Profile에서 선택한 프로필 이름에 DEV-, STG-, PRD- 포함 시 환경 설정이 자동 적용됩니다
              <br />
              • 로그인되지 않은 경우: <code>aws sso login</code> 실행 후 새로고침
            </Typography>
          </Alert>

          <TextField
            label="AWS Region"
            value={config.region}
            fullWidth
            InputProps={{
              readOnly: true,
            }}
            helperText="리전은 AWS 프로필에서 자동으로 설정됩니다"
          />

          <TextField
            label="Connect Instance ID"
            value={config.instanceId}
            onChange={(e) => !isMappedProfile && updateConfig({ instanceId: e.target.value })}
            fullWidth
            InputProps={{
              readOnly: isMappedProfile,
              endAdornment: isMappedProfile && (
                <Chip label="자동설정" size="small" color="primary" variant="outlined" />
              ),
            }}
            helperText={isMappedProfile ? "프로필 매핑에 의해 자동 설정됨" : "예: 12345678-1234-1234-1234-123456789012"}
          />

          <FormControl fullWidth disabled={isMappedProfile}>
            <InputLabel>Environment</InputLabel>
            <Select
              value={config.environment}
              label="Environment"
              onChange={(e) => !isMappedProfile && updateConfig({ environment: e.target.value as any })}
              endAdornment={isMappedProfile && (
                <Chip label="자동설정" size="small" color="primary" variant="outlined" sx={{ mr: 3 }} />
              )}
            >
              <MenuItem value="dev">Development</MenuItem>
              <MenuItem value="stg">Staging</MenuItem>
              <MenuItem value="prd">Production</MenuItem>
              <MenuItem value="test">Test</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="CloudWatch Log Group Name"
            value={config.logGroupName}
            onChange={(e) => !isMappedProfile && updateConfig({ logGroupName: e.target.value })}
            fullWidth
            InputProps={{
              readOnly: isMappedProfile,
              endAdornment: isMappedProfile && (
                <Chip label="자동설정" size="small" color="primary" variant="outlined" />
              ),
            }}
            helperText={isMappedProfile ? "프로필 매핑에 의해 자동 설정됨" : "예: /aws/connect/your-instance"}
          />

          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button variant="outlined" onClick={handleReset}>
              초기화
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* QM Flow Log Filter Keywords */}
      <Paper sx={{ p: 3, maxWidth: 800, mt: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6">
            QM Flow X-Ray 로그 필터 키워드
          </Typography>
          <Typography variant="body2" color="text.secondary">
            아래 키워드가 포함된 로그는 QM Flow X-Ray Trace 뷰어에서 표시되지 않습니다.
          </Typography>

          <Stack direction="row" spacing={1}>
            <TextField
              label="필터 키워드 추가"
              size="small"
              fullWidth
              value={newFilterKeyword}
              onChange={(e) => setNewFilterKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddFilterKeyword();
                }
              }}
              placeholder="예: START, END, REPORT"
            />
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddFilterKeyword}
              disabled={!newFilterKeyword.trim()}
              sx={{ whiteSpace: 'nowrap' }}
            >
              추가
            </Button>
          </Stack>

          {(config.qmFlowLogFilterKeywords || []).length > 0 ? (
            <List dense>
              {(config.qmFlowLogFilterKeywords || []).map((keyword, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={
                      <Chip
                        label={keyword}
                        size="small"
                        variant="outlined"
                        sx={{ fontFamily: 'monospace' }}
                      />
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleRemoveFilterKeyword(index)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              설정된 필터 키워드가 없습니다.
            </Typography>
          )}
        </Stack>
      </Paper>
    </Box>
  );
};

export default Settings;
