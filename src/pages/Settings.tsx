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
} from '@mui/material';
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
  const [localConfig, setLocalConfig] = useState(config);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [ssoProfiles, setSsoProfiles] = useState<AWSSSOProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // 현재 프로필이 매핑된 환경인지 확인
  const isMappedProfile = useMemo(() => {
    return isProfileMapped(localConfig.profile || '');
  }, [localConfig.profile]);

  // 프로필 매핑 정보 가져오기
  const profileMapping = useMemo(() => {
    return getProfileMapping(localConfig.profile || '');
  }, [localConfig.profile]);

  const handleSave = () => {
    updateConfig(localConfig);
    setSaved(true);
    setError(null);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    resetConfig();
    setLocalConfig(config);
    setError(null);
  };

  const handleFetchSSOCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const credentials = await fetchSSOCredentials(localConfig.profile);

      // 프로필 매핑 적용
      const mapping = getProfileMapping(localConfig.profile || '');
      const newConfig = {
        ...localConfig,
        credentials,
        ...(mapping && {
          region: mapping.region,
          instanceId: mapping.instanceId,
          environment: mapping.environment,
          logGroupName: mapping.logGroupName,
        }),
      };
      setLocalConfig(newConfig);
      // 자동 저장
      updateConfig(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'SSO 자격 증명을 가져오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadEnvCredentials = () => {
    const credentials = getCredentialsFromEnv();
    if (credentials) {
      setLocalConfig({
        ...localConfig,
        credentials,
      });
      setSaved(false);
      alert('환경 변수에서 자격 증명을 가져왔습니다. "저장" 버튼을 눌러 저장하세요.');
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
        // 1. SSO 프로필 목록 가져오기
        const profiles = await fetchSSOProfiles();
        setSsoProfiles(profiles);

        // 2. 로그인된 프로필 찾기
        const loggedInProfiles = profiles.filter(p => p.isLoggedIn);

        if (loggedInProfiles.length > 0) {
          // 로그인된 프로필 중 첫 번째 선택 (또는 기존 설정된 프로필 유지)
          const targetProfile = localConfig.profile
            ? loggedInProfiles.find(p => p.name === localConfig.profile) || loggedInProfiles[0]
            : loggedInProfiles[0];

          // 자격증명 가져오기
          const credentials = await fetchSSOCredentials(targetProfile.name);

          // 프로필 매핑 적용
          const mapping = getProfileMapping(targetProfile.name);
          const newConfig = {
            ...localConfig,
            credentials,
            profile: targetProfile.name,
            region: mapping?.region || targetProfile.region,
            ...(mapping && {
              instanceId: mapping.instanceId,
              environment: mapping.environment,
              logGroupName: mapping.logGroupName,
            }),
          };
          setLocalConfig(newConfig);
          // 자동 저장
          updateConfig(newConfig);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        } else if (profiles.length > 0) {
          // 프로필은 있지만 로그인되지 않은 경우
          setWarning(`AWS SSO 프로필이 ${profiles.length}개 발견되었지만 로그인되어 있지 않습니다. 아래에서 프로필을 선택 후 "aws sso login --profile <profile>"을 실행하세요.`);
        } else {
          // SSO 프로필이 없는 경우 - 기존 방식 시도
          const ssoData = await autoFetchSSOCredentials();
          if (ssoData) {
            setLocalConfig(prev => ({
              ...prev,
              credentials: ssoData.credentials,
              profile: ssoData.profile,
              region: ssoData.region,
            }));
            setSaved(false);
          } else {
            setWarning('AWS SSO 프로필을 찾을 수 없습니다. ~/.aws/config 파일에 SSO 프로필을 설정하거나 수동으로 자격 증명을 입력하세요.');
          }
        }
      } catch (err) {
        setWarning('AWS SSO 자격 증명을 자동으로 가져오지 못했습니다. 수동으로 입력하세요.');
      } finally {
        setLoading(false);
        setLoadingProfiles(false);
      }
    };

    autoLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        AWS 설정
      </Typography>

      {saved && (
        <Alert severity="success" sx={{ mb: 2 }}>
          설정이 저장되었습니다.
        </Alert>
      )}

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
          {/* AWS Region - Read Only */}
          <TextField
            label="AWS Region"
            value={localConfig.region}
            fullWidth
            InputProps={{
              readOnly: true,
            }}
            helperText="리전은 AWS 프로필에서 자동으로 설정됩니다"
          />

          {/* Instance ID */}
          <TextField
            label="Connect Instance ID"
            value={localConfig.instanceId}
            onChange={(e) => !isMappedProfile && setLocalConfig({ ...localConfig, instanceId: e.target.value })}
            fullWidth
            InputProps={{
              readOnly: isMappedProfile,
              endAdornment: isMappedProfile && (
                <Chip label="자동설정" size="small" color="primary" variant="outlined" />
              ),
            }}
            helperText={isMappedProfile ? "프로필 매핑에 의해 자동 설정됨" : "예: 12345678-1234-1234-1234-123456789012"}
          />

          {/* Environment */}
          <FormControl fullWidth disabled={isMappedProfile}>
            <InputLabel>Environment</InputLabel>
            <Select
              value={localConfig.environment}
              label="Environment"
              onChange={(e) => !isMappedProfile && setLocalConfig({ ...localConfig, environment: e.target.value as any })}
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

          {/* Log Group Name */}
          <TextField
            label="CloudWatch Log Group Name"
            value={localConfig.logGroupName}
            onChange={(e) => !isMappedProfile && setLocalConfig({ ...localConfig, logGroupName: e.target.value })}
            fullWidth
            InputProps={{
              readOnly: isMappedProfile,
              endAdornment: isMappedProfile && (
                <Chip label="자동설정" size="small" color="primary" variant="outlined" />
              ),
            }}
            helperText={isMappedProfile ? "프로필 매핑에 의해 자동 설정됨" : "예: /aws/connect/your-instance"}
          />

          {/* Credential Options */}
          <Typography variant="h6" sx={{ mt: 2 }}>
            인증 설정
          </Typography>

          {/* SSO Profile Selection */}
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
                value={ssoProfiles.find(p => p.name === localConfig.profile) || null}
                onChange={async (event, newValue) => {
                  if (newValue) {
                    // 프로필 매핑 확인
                    const mapping = getProfileMapping(newValue.name);

                    setLocalConfig(prev => ({
                      ...prev,
                      profile: newValue.name,
                      region: mapping?.region || newValue.region,
                      ...(mapping && {
                        instanceId: mapping.instanceId,
                        environment: mapping.environment,
                        logGroupName: mapping.logGroupName,
                      }),
                    }));

                    // 로그인된 프로필이면 자동으로 자격증명 가져오기 및 저장
                    if (newValue.isLoggedIn) {
                      setLoading(true);
                      try {
                        const credentials = await fetchSSOCredentials(newValue.name);
                        const newConfig = {
                          ...localConfig,
                          credentials,
                          profile: newValue.name,
                          region: mapping?.region || newValue.region,
                          ...(mapping && {
                            instanceId: mapping.instanceId,
                            environment: mapping.environment,
                            logGroupName: mapping.logGroupName,
                          }),
                        };
                        setLocalConfig(newConfig);
                        // 자동 저장
                        updateConfig(newConfig);
                        setSaved(true);
                        setTimeout(() => setSaved(false), 3000);
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
                      localConfig.profile
                        ? ssoProfiles.find(p => p.name === localConfig.profile)?.isLoggedIn
                          ? '✓ 로그인됨'
                          : '⚠ 로그인 필요: aws sso login --profile ' + localConfig.profile
                        : '프로필을 선택하세요'
                    }
                  />
                )}
              />
            ) : (
              <TextField
                label="AWS SSO Profile"
                value={localConfig.profile || ''}
                onChange={(e) => setLocalConfig({ ...localConfig, profile: e.target.value })}
                fullWidth
                helperText="SSO 프로필이 발견되지 않았습니다. 직접 입력하세요."
              />
            )}
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              onClick={handleFetchSSOCredentials}
              disabled={loading || !localConfig.profile}
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

          {localConfig.credentials && (
            <Alert severity="success" sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>자격 증명 로드됨</strong>
                <br />
                Access Key: {localConfig.credentials.accessKeyId.substring(0, 8)}...
                {localConfig.credentials.expiration && (
                  <>
                    <br />
                    만료: {new Date(localConfig.credentials.expiration).toLocaleString()}
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
              • 페이지 로드 시 로컬 PC의 SSO 프로필을 자동으로 검색합니다
              <br />
              • 프로필 이름에 -DEV-, -STG-, -PRD- 포함 시 환경 설정이 자동 적용됩니다
              <br />
              • 로그인되지 않은 경우: <code>aws sso login --profile 프로필명</code> 실행 후 새로고침
            </Typography>
          </Alert>

          {/* Action Buttons */}
          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button variant="contained" onClick={handleSave}>
              저장
            </Button>
            <Button variant="outlined" onClick={handleReset}>
              초기화
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
};

export default Settings;
