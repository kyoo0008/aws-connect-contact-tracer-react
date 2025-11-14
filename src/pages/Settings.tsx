import React, { useState } from 'react';
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
  FormControlLabel,
  Switch,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useConfig } from '@/contexts/ConfigContext';
import { fetchSSOCredentials, getCredentialsFromEnv } from '@/services/credentialService';

const Settings: React.FC = () => {
  const { config, updateConfig, resetConfig } = useConfig();
  const [localConfig, setLocalConfig] = useState(config);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setLocalConfig({
        ...localConfig,
        credentials,
      });
      setSaved(false);
      alert('SSO 자격 증명을 성공적으로 가져왔습니다. "저장" 버튼을 눌러 저장하세요.');
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

      <Paper sx={{ p: 3, maxWidth: 800 }}>
        <Stack spacing={3}>
          {/* AWS Region */}
          <TextField
            label="AWS Region"
            value={localConfig.region}
            onChange={(e) => setLocalConfig({ ...localConfig, region: e.target.value })}
            fullWidth
          />

          {/* Instance ID */}
          <TextField
            label="Connect Instance ID"
            value={localConfig.instanceId}
            onChange={(e) => setLocalConfig({ ...localConfig, instanceId: e.target.value })}
            fullWidth
            helperText="예: 12345678-1234-1234-1234-123456789012"
          />

          {/* Environment */}
          <FormControl fullWidth>
            <InputLabel>Environment</InputLabel>
            <Select
              value={localConfig.environment}
              label="Environment"
              onChange={(e) => setLocalConfig({ ...localConfig, environment: e.target.value as any })}
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
            onChange={(e) => setLocalConfig({ ...localConfig, logGroupName: e.target.value })}
            fullWidth
            helperText="예: /aws/connect/your-instance"
          />

          {/* S3 Bucket Prefix */}
          <TextField
            label="S3 Bucket Prefix"
            value={localConfig.s3BucketPrefix}
            onChange={(e) => setLocalConfig({ ...localConfig, s3BucketPrefix: e.target.value })}
            fullWidth
          />

          {/* Credential Options */}
          <Typography variant="h6" sx={{ mt: 2 }}>
            인증 설정
          </Typography>

          {/* SSO Profile and Fetch Button */}
          <TextField
            label="AWS SSO Profile"
            value={localConfig.profile || ''}
            onChange={(e) => setLocalConfig({ ...localConfig, profile: e.target.value })}
            fullWidth
            helperText="백엔드에서 SSO 자격 증명을 가져올 프로필 이름"
          />

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              onClick={handleFetchSSOCredentials}
              disabled={loading}
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

          <Alert severity="info">
            <Typography variant="body2">
              <strong>SSO 자격 증명 사용 방법:</strong>
              <br />
              1. 백엔드 API 서버가 필요합니다 (package.json의 proxy 설정 확인)
              <br />
              2. 백엔드에서 <code>aws sso login --profile your-profile</code> 실행
              <br />
              3. 위 "SSO 자격 증명 가져오기" 버튼 클릭
              <br />
              <br />
              또는 환경 변수를 사용하려면 .env 파일에 다음을 설정하세요:
              <br />
              REACT_APP_AWS_ACCESS_KEY_ID=your_key
              <br />
              REACT_APP_AWS_SECRET_ACCESS_KEY=your_secret
            </Typography>
          </Alert>

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            또는 수동으로 자격 증명 입력:
          </Typography>

          <TextField
                label="Access Key ID"
                value={localConfig.credentials?.accessKeyId || ''}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    credentials: {
                      ...localConfig.credentials!,
                      accessKeyId: e.target.value,
                    },
                  })
                }
                fullWidth
                type="password"
              />

              <TextField
                label="Secret Access Key"
                value={localConfig.credentials?.secretAccessKey || ''}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    credentials: {
                      ...localConfig.credentials!,
                      secretAccessKey: e.target.value,
                    },
                  })
                }
                fullWidth
                type="password"
              />

              <TextField
                label="Session Token (선택사항)"
                value={localConfig.credentials?.sessionToken || ''}
                onChange={(e) =>
                  setLocalConfig({
                    ...localConfig,
                    credentials: {
                      ...localConfig.credentials!,
                      sessionToken: e.target.value,
                    },
                  })
                }
                fullWidth
                type="password"
              />

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
