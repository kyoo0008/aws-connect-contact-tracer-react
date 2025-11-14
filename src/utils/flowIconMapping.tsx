import React from 'react';
import {
  Settings as SettingsIcon,
  Call as CallIcon,
  CallEnd as CallEndIcon,
  PlayArrow as PlayArrowIcon,
  Input as InputIcon,
  Loop as LoopIcon,
  AltRoute as AltRouteIcon,
  AccountTree as AccountTreeIcon,
  Person as PersonIcon,
  Timer as TimerIcon,
  Code as CodeIcon,
  Help as HelpIcon,
  Message as MessageIcon,
  RecordVoiceOver as RecordVoiceOverIcon,
  Pause as PauseIcon,
  FastForward as FastForwardIcon,
  Reply as ReplyIcon,
  Tag as TagIcon,
  Queue as QueueIcon,
  Schedule as ScheduleIcon,
  People as PeopleIcon,
  BarChart as BarChartIcon,
  Security as SecurityIcon,
  SpeakerPhone as SpeakerPhoneIcon,
  Visibility as VisibilityIcon,
  CloudUpload as CloudUploadIcon,
  CloudDownload as CloudDownloadIcon,
  Save as SaveIcon,
  PhoneCallback as PhoneCallbackIcon,
  HourglassEmpty as HourglassEmptyIcon,
  BugReport as BugReportIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Assignment as AssignmentIcon,
  Group as GroupIcon,
  ConnectWithoutContact as ConnectWithoutContactIcon,
  VerifiedUser as VerifiedUserIcon,
  ChangeCircle as ChangeCircleIcon,
  FactCheck as FactCheckIcon,
  AccessTime as AccessTimeIcon,
  Work as WorkIcon,
  Task as TaskIcon,
  Dialpad as DialpadIcon,
  Percent as PercentIcon,
  Forum as ForumIcon,
  Mic as MicIcon,
  VolumeUp as VolumeUpIcon,
  Stop as StopIcon,
  ContactMail as ContactMailIcon,
  Event as EventIcon,
  VoiceChat as VoiceChatIcon,
  SupportAgent as SupportAgentIcon,
  QuestionAnswer as QuestionAnswerIcon,
  Speaker as SpeakerIcon,
  Handshake as HandshakeIcon, // For AssociateContactToCustomerProfile
  Lock as LockIcon, // For AuthenticateParticipant
  Folder as FolderIcon, // For Cases
  AddBox as AddBoxIcon, // For CreateCase
  GetApp as GetAppIcon, // For GetCase
  Update as UpdateIcon, // For UpdateCase
  SwapHoriz as SwapHorizIcon, // For ChangeRoutingPriority
  Rule as RuleIcon, // For CheckAttribute, CheckContactAttributes
  AccessTimeFilled as AccessTimeFilledIcon, // For CheckHoursOfOperation
  QueuePlayNext as QueuePlayNextIcon, // For CheckQueueStatus
  Groups as GroupsIcon, // For CheckStaffing
  Contactless as ContactlessIcon, // For CreatePersistentContactAssociation
  AssignmentTurnedIn as AssignmentTurnedInIcon, // For CreateTask
  AccountCircle as AccountCircleIcon, // For CustomerProfiles, CreateCustomerProfile, GetCustomerProfile
  PhoneInTalk as PhoneInTalkIcon, // For Dial
  CallSplit as CallSplitIcon, // For DistributeByPercentage
  RecordVoiceOver as RecordVoiceOverOutlinedIcon, // For GetCustomerInput, GetUserInput, StoreUserInput, StoreCustomerInput
  QueryStats as QueryStatsIcon, // For GetMetricData, GetQueueMetrics
  PauseCircleFilled as PauseCircleFilledIcon, // For HoldCustomerOrAgent
  Extension as ExtensionIcon, // For InvokeFlowModule
  Repeat as RepeatIcon, // For Loop, LoopPrompts
  ReplyAll as ReplyAllIcon, // For ReturnFromFlowModule
  Send as SendIcon, // For SendMessage
  SettingsInputAntenna as SettingsInputAntennaIcon, // For SetAttributes, SetContactData, SetFlowAttributes
  GroupAdd as GroupAddIcon, // For SetCustomerQueueFlow
  CallEnd as CallEndOutlinedIcon, // For SetDisconnectFlow
  EventNote as EventNoteIcon, // For SetEventHook
  VolumeMute as VolumeMuteIcon, // For SetHoldFlow

  PlaylistAdd as PlaylistAddIcon, // For SetQueue
  MicNone as MicNoneIcon, // For SetRecordingAndAnalyticsBehavior, SetRecordingBehavior
  Route as RouteIcon, // For SetRoutingCriteria
  RecordVoiceOver as RecordVoiceOverRoundedIcon, // For SetVoice
  RecordVoiceOver as RecordVoiceOverSharpIcon, // For SetWhisperFlow
  Lightbulb as LightbulbIcon, // For SetWisdomAssistant
  Visibility as VisibilityOutlinedIcon, // For ShowView
  Stream as StreamIcon, // For StartMediaStreaming, StopMediaStreaming
  Label as LabelIcon, // For TagContact
  CallMade as CallMadeIcon, // For Transfer, TransferToFlow, TransferToPhoneNumber, TransferToQueue
  Update as UpdateOutlinedIcon, // For UpdateAgentState
  PhoneCallback as PhoneCallbackOutlinedIcon, // For UpdateContactCallbackNumber
  HourglassTop as HourglassTopIcon, // For Wait
  BugReport as BugReportOutlinedIcon, // For X-Ray Lambda Log Trace (xray)
} from '@mui/icons-material';

interface FlowIconMap {
  [key: string]: React.ElementType;
}

export const flowIconMap: FlowIconMap = {
  "AssociateContactToCustomerProfile": HandshakeIcon,
  "AuthenticateParticipant": LockIcon,
  "Cases": FolderIcon,
  "CreateCase": AddBoxIcon,
  "GetCase": GetAppIcon,
  "UpdateCase": UpdateIcon,
  "ChangeRoutingPriority": SwapHorizIcon,
  "CheckAttribute": FactCheckIcon,
  "CheckContactAttributes": FactCheckIcon,
  "CheckHoursOfOperation": AccessTimeFilledIcon,
  "CheckQueueStatus": QueuePlayNextIcon,
  "CheckStaffing": GroupsIcon,
  "CreatePersistentContactAssociation": ContactlessIcon,
  "CreateTask": AssignmentTurnedInIcon,
  "CustomerProfiles": AccountCircleIcon,
  "CreateCustomerProfile": AccountCircleIcon,
  "Dial": PhoneInTalkIcon,
  "Disconnect": CallEndIcon,
  "DistributeByPercentage": PercentIcon,
  "GetCustomerInput": RecordVoiceOverOutlinedIcon,
  "ConnectParticipantWithLexBot": QuestionAnswerIcon, // Using QuestionAnswer for LexBot
  "GetCustomerProfile": AccountCircleIcon,
  "GetMetricData": BarChartIcon,
  "GetQueueMetrics": BarChartIcon,
  "GetUserInput": RecordVoiceOverOutlinedIcon,
  "HoldCustomerOrAgent": PauseCircleFilledIcon,
  "InvokeExternalResource": CodeIcon, // Lambda function call
  "InvokeFlowModule": ExtensionIcon,
  "InvokeLambdaFunction": CodeIcon, // Lambda function call
  "Loop": LoopIcon,
  "LoopPrompts": LoopIcon, // Same as Loop for now
  "PlayPrompt": PlayArrowIcon,
  "Resume": FastForwardIcon,
  "ResumeContact": FastForwardIcon,
  "ReturnFromFlowModule": ReplyAllIcon,
  "SendMessage": SendIcon,
  "SetAttributes": SettingsInputAntennaIcon,
  "SetContactData": SettingsInputAntennaIcon,
  "SetCustomerQueueFlow": GroupAddIcon,
  "SetDisconnectFlow": CallEndOutlinedIcon,
  "SetEventHook": EventNoteIcon,
  "SetFlowAttributes": SettingsInputAntennaIcon,
  "SetHoldFlow": VolumeMuteIcon,
  "SetLoggingBehavior": SettingsIcon, // Using Settings for logging behavior
  "SetQueue": PlaylistAddIcon,
  "SetRecordingAndAnalyticsBehavior": MicNoneIcon,
  "SetRecordingBehavior": MicNoneIcon,
  "SetRoutingCriteria": RouteIcon,
  "SetVoice": RecordVoiceOverRoundedIcon,
  "SetWhisperFlow": RecordVoiceOverSharpIcon,
  "SetWisdomAssistant": LightbulbIcon,
  "ShowView": VisibilityOutlinedIcon,
  "StartMediaStreaming": StreamIcon,
  "StopMediaStreaming": StopIcon,
  "StoreCustomerInput": SaveIcon,
  "StoreUserInput": SaveIcon,
  "TagContact": LabelIcon,
  "Transfer": CallMadeIcon,
  "TransferToFlow": CallMadeIcon,
  "TransferToPhoneNumber": CallMadeIcon,
  "TransferToQueue": CallMadeIcon,
  "UpdateAgentState": SupportAgentIcon, // Using SupportAgent for agent state update
  "UpdateContactCallbackNumber": PhoneCallbackOutlinedIcon,
  "Wait": HourglassTopIcon,
  "xray": BugReportOutlinedIcon, // Using BugReport for X-Ray
};

export const getFlowIcon = (moduleType: string): React.ElementType => {
  return flowIconMap[moduleType] || HelpIcon; // Default to HelpIcon if not found
};
