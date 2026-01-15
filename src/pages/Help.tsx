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
                                                        primary="Access Key ID / Secret Access Key"
                                                        secondary="AWS IAM 사용자 또는 역할의 자격 증명 정보"
                                                    />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><CheckIcon color="success" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Region"
                                                        secondary="Amazon Connect 인스턴스가 위치한 리전 (예: ap-northeast-2)"
                                                    />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><CheckIcon color="success" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Instance ID"
                                                        secondary="Connect 인스턴스의 고유 ID (Contact Flow 로그 조회 등에 필요)"
                                                    />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><CheckIcon color="success" /></ListItemIcon>
                                                    <ListItemText
                                                        primary="Environment"
                                                        secondary="실행 환경 구분 (dev, stg, prd 등)"
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
                                    상담 내역(Transcript) 및 오디오(Audio)를 바탕으로 상담 품질, 규정 준수 여부, 고객 만족도 등을 분석합니다.
                                </Typography>
                            </Box>

                            <Divider />

                            <Box>
                                <Typography variant="h6" gutterBottom fontWeight={600}>
                                    1. 분석 시작하기
                                </Typography>
                                <Typography variant="body2" paragraph>
                                    날짜 범위를 설정하거나 <strong>Contact ID</strong>를 검색하여 기존 분석을 조회하고, 신규 분석을 요청할 수 있습니다.
                                </Typography>

                                <List>
                                    <ListItem disablePadding sx={{ mb: 2 }}>
                                        <ListItemIcon><PlayIcon /></ListItemIcon>
                                        <ListItemText
                                            primary="이력 조회 및 검색"
                                            secondary="목록 상단의 Date Picker를 통해 특정 기간의 분석 이력을 불러올 수 있으며, Contact ID 검색을 통해 특정 상담 건을 즉시 찾을 수 있습니다."
                                        />
                                    </ListItem>
                                </List>

                                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                                    <Typography variant="subtitle2" gutterBottom>새 QM 분석 옵션 설명:</Typography>
                                    <List dense>
                                        <ListItem>
                                            <ListItemText primary="• 모델 및 파라미터 선택" secondary="Gemini 2.5 Pro/Flash/Lite 모델 중 선택 가능하며, Temperature와 Max Output Tokens를 조절할 수 있습니다." />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="• Thinking Process" secondary="AI가 최종 답변을 내놓기 전 추론 과정을 출력합니다. Thinking Budget으로 추론에 사용할 토큰 범위를 설정합니다." />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="• Tool/Function Calling" secondary="구조화된 정보 추출을 위해 사용합니다. 기본 템플릿 외에 직접 JSON 형식을 입력하여 Custom Tool을 정의할 수 있습니다." />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText primary="• 오디오 분석" secondary="음성 데이터를 분석하여 상담 요약, 불만 상황, 대화 패턴 등을 파악합니다." />
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
                                                    목록 화면 (List View)
                                                </Typography>
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                분석 상태, 모델명, 상담 연결 시각, 최근 수정 시각 등을 한눈에 확인합니다.
                                            </Typography>
                                            <List dense>
                                                <ListItem>
                                                    <ListItemIcon><CheckIcon fontSize="small" color="primary" /></ListItemIcon>
                                                    <ListItemText primary="필터 및 정렬" secondary="연결 시간, 총 처리 시간, 업데이트 시간 기준으로 데이터를 정렬하여 우선순위를 확인할 수 있습니다." />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><CheckIcon fontSize="small" color="primary" /></ListItemIcon>
                                                    <ListItemText primary="총 처리 시간" secondary="QM 분석, Tool 실행, 오디오 분석에 소요된 전체 시간을 합산하여 보여줍니다." />
                                                </ListItem>
                                            </List>
                                        </CardContent>
                                    </Card>

                                    <Card variant="outlined">
                                        <CardContent>
                                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                                                <DetailIcon color="primary" />
                                                <Typography variant="subtitle1" fontWeight={600}>
                                                    상세 화면 (Detail View)
                                                </Typography>
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary" paragraph>
                                                분석 전 과정의 메타데이터와 최종 결과물을 탭 형식으로 제공합니다.
                                            </Typography>
                                            <List dense>
                                                <ListItem>
                                                    <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText primary="QM 평가 결과 탭" secondary="종합 리포트, 사용된 프롬프트, Thinking Process(추론 과정) 및 상세 토큰 통계를 포함합니다." />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText primary="Function Calls 탭" secondary="Tool 사용 시 호출된 각 함수의 상세 인자(Arguments)와 실행 결과(Result)를 대조 확인할 수 있습니다." />
                                                </ListItem>
                                                <ListItem>
                                                    <ListItemIcon><InfoIcon fontSize="small" /></ListItemIcon>
                                                    <ListItemText primary="상단 요약 섹션" secondary="단계별 소요 시간과 토큰 사용량을 시각적으로 요약하여 비용 및 효율성을 파악하기 용이합니다." />
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
