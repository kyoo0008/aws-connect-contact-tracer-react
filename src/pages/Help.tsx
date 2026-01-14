import React, { useState } from 'react';
import {
    Box,
    Container,
    Paper,
    Typography,
    Tabs,
    Tab,
    Stack,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Alert,
    Card,
    CardContent,
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Psychology as QMIcon,
    VpnKey as KeyIcon,
    PlayArrow as PlayIcon,
    TableChart as ListIcon,
    Description as DetailIcon,
    CheckCircle as CheckIcon,
    Info as InfoIcon,
} from '@mui/icons-material';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
    return (
        <div role="tabpanel" hidden={value !== index} style={{ padding: '24px 0' }}>
            {value === index && children}
        </div>
    );
};

const Help: React.FC = () => {
    const [tabValue, setTabValue] = useState(0);

    const handleChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom fontWeight={600}>
                Help & Documentation
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
                AWS Contact Tracer 및 QM Automation 기능 사용을 위한 가이드입니다.
            </Typography>

            <Paper elevation={1} sx={{ p: 0 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 2 }}>
                    <Tabs value={tabValue} onChange={handleChange}>
                        <Tab label="초기 설정 (Settings)" icon={<SettingsIcon />} iconPosition="start" />
                        <Tab label="QM Evaluation 가이드" icon={<QMIcon />} iconPosition="start" />
                    </Tabs>
                </Box>

                <Box sx={{ p: 3 }}>
                    {/* Settings Manual */}
                    <TabPanel value={tabValue} index={0}>
                        <Stack spacing={4}>
                            <Box>
                                <Typography variant="h5" gutterBottom fontWeight={600}>
                                    AWS 자격 증명 설정
                                </Typography>
                                <Typography paragraph>
                                    이 애플리케이션은 AWS Connect 및 관련 서비스(DynamoDB, Lambda 등)에 접근하기 위해 AWS 자격 증명이 필요합니다.
                                    <br />
                                    <strong>Settings</strong> 페이지에서 자격 증명을 올바르게 입력해야 모든 기능을 사용할 수 있습니다.
                                </Typography>

                                <Alert severity="info" sx={{ mb: 3 }}>
                                    입력된 자격 증명은 브라우저의 로컬 스토리지에만 저장되며, 외부 서버로 전송되지 않습니다.
                                </Alert>

                                <Card variant="outlined" sx={{ mb: 3 }}>
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Typography variant="h6" fontSize="1.1rem">
                                                필수 입력 정보
                                            </Typography>
                                            <List dense>
                                                <ListItem>
                                                    <ListItemIcon><KeyIcon color="primary" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Access Key ID"
                                                        secondary="AWS IAM 사용자 또는 역할의 액세스 키 ID (예: AKIA...)"
                                                    />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><KeyIcon color="primary" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Secret Access Key"
                                                        secondary="AWS IAM 사용자 또는 역할의 비밀 액세스 키"
                                                    />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><CheckIcon color="success" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Region"
                                                        secondary="AWS 리전 코드 (예: ap-northeast-2)"
                                                    />
                                                </ListItem>
                                            </List>
                                        </Stack>
                                    </CardContent>
                                </Card>

                                <Card variant="outlined">
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Typography variant="h6" fontSize="1.1rem">
                                                선택 입력 정보 (임시 자격 증명 사용 시)
                                            </Typography>
                                            <List dense>
                                                <ListItem>
                                                    <ListItemIcon><KeyIcon color="action" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Session Token"
                                                        secondary="MFA 또는 임시 자격 증명을 사용하는 경우 세션 토큰이 필요합니다."
                                                    />
                                                </ListItem>
                                            </List>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Box>
                        </Stack>
                    </TabPanel>

                    {/* QM Automation Manual */}
                    <TabPanel value={tabValue} index={1}>
                        <Stack spacing={4}>
                            <Box>
                                <Typography variant="h5" gutterBottom fontWeight={600}>
                                    QM Evaluation이란?
                                </Typography>
                                <Typography paragraph>
                                    LLM(Gemini)을 활용하여 상담 내용을 자동으로 분석하고 평가하는 기능입니다.
                                    상담 내역(Transcript)을 바탕으로 상담 품질, 규정 준수 여부, 고객 만족도 등을 자동으로 평가합니다.
                                </Typography>
                            </Box>

                            <Divider />

                            <Box>
                                <Typography variant="h6" gutterBottom fontWeight={600}>
                                    1. 분석 시작하기
                                </Typography>
                                <Typography variant="body2" paragraph>
                                    <strong>Contact ID</strong>를 기반으로 분석을 요청할 수 있습니다.
                                </Typography>

                                <List>
                                    <ListItem disablePadding sx={{ mb: 2 }}>
                                        <ListItemIcon><PlayIcon /></ListItemIcon>
                                        <ListItemText
                                            primary="새 QM 분석 요청"
                                            secondary="QM Evaluation 목록 화면에서 '새 QM 분석' 버튼을 클릭하거나, 검색창에 Contact ID를 입력하여 분석을 시작할 수 있습니다."
                                        />
                                    </ListItem>
                                </List>

                                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                                    <Typography variant="subtitle2" gutterBottom>분석 옵션 설명:</Typography>
                                    <List dense>
                                        <ListItem>
                                            <ListItemText primary="• 모델 선택" secondary="Gemini-2.5-Pro (권장) 등 분석에 사용할 LLM 모델을 선택합니다." />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="• 기본 QM 프롬프트 사용" secondary="미리 정의된 표준 QM 평가 양식을 사용합니다. 해제 시 직접 프롬프트를 입력할 수 있습니다." />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="• Tool/Function Calling" secondary="외부 시스템 연동이나 특정 포맷의 구조적 데이터 추출이 필요할 때 사용합니다." />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="• 오디오 분석 사용" secondary="통화 녹음 파일(Audio) 자체를 분석하여 음성 톤, 침묵 구간 등을 파악합니다. (비용이 추가될 수 있습니다)" />
                                        </ListItem>
                                    </List>
                                </Paper>
                            </Box>

                            <Divider />

                            <Box>
                                <Typography variant="h6" gutterBottom fontWeight={600}>
                                    2. 결과 확인하기
                                </Typography>
                                <Stack spacing={2}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                                                <ListIcon color="primary" />
                                                <Typography variant="subtitle1" fontWeight={600}>
                                                    목록 화면
                                                </Typography>
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">
                                                날짜별, ID별로 과거 분석 이력을 조회할 수 있습니다.
                                                상태(성공/실패), 모델, 처리 시간 등을 한눈에 확인할 수 있습니다.
                                            </Typography>
                                        </CardContent>
                                    </Card>

                                    <Card variant="outlined">
                                        <CardContent>
                                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                                                <DetailIcon color="primary" />
                                                <Typography variant="subtitle1" fontWeight={600}>
                                                    상세 화면
                                                </Typography>
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                각 분석 요청의 상세 결과를 탭별로 확인할 수 있습니다.
                                            </Typography>
                                            <List dense>
                                                <ListItem>
                                                    <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText primary="QM 평가 결과" secondary="LLM이 생성한 종합 평가 리포트" />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText primary="Function Calls" secondary="구조화된 데이터 추출 결과 (Tool 사용 시)" />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText primary="Thinking Process" secondary="AI가 결론을 도출하기까지의 추론 과정" />
                                                </ListItem>
                                            </List>
                                        </CardContent>
                                    </Card>
                                </Stack>
                            </Box>
                        </Stack>
                    </TabPanel>
                </Box>
            </Paper>
        </Container>
    );
};

export default Help;
