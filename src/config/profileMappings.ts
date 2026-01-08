/**
 * AWS SSO Profile 기반 자동 설정 매핑
 *
 * 프로필 이름에 특정 키워드가 포함되어 있으면 해당 환경의 설정을 자동으로 적용합니다.
 */

export interface ProfileMapping {
  keyword: string;
  region: string;
  instanceId: string;
  environment: 'dev' | 'stg' | 'prd' | 'test';
  logGroupName: string;
}

/**
 * 프로필 키워드별 설정 매핑
 * keyword는 대소문자 구분 없이 프로필 이름에서 검색됩니다.
 */
export const profileMappings: ProfileMapping[] = [
  {
    keyword: '-DEV-',
    region: 'ap-northeast-2',
    instanceId: '08352314-25ec-473b-b997-f064366798b8',
    environment: 'dev',
    logGroupName: '/aws/connect/kal-servicecenter-dev',
  },
  {
    keyword: '-STG-',
    region: 'ap-northeast-2',
    instanceId: '61925798-4f7a-4aca-993e-882f6c5182bc',
    environment: 'stg',
    logGroupName: '/aws/connect/kal-servicecenter-stg',
  },
  {
    keyword: '-PRD-',
    region: 'ap-northeast-2',
    instanceId: '41810ec8-c661-4972-b81c-59976d316de9',
    environment: 'prd',
    logGroupName: '/aws/connect/kal-servicecenter',
  },
];

/**
 * 프로필 이름에서 매칭되는 설정을 찾습니다.
 * @param profileName AWS SSO 프로필 이름
 * @returns 매칭되는 설정 또는 null
 */
export function getProfileMapping(profileName: string): ProfileMapping | null {
  if (!profileName) return null;

  const upperProfileName = profileName.toUpperCase();

  for (const mapping of profileMappings) {
    if (upperProfileName.includes(mapping.keyword.toUpperCase())) {
      return mapping;
    }
  }

  return null;
}

/**
 * 프로필 이름이 매핑된 환경인지 확인합니다.
 * @param profileName AWS SSO 프로필 이름
 * @returns 매핑된 환경 여부
 */
export function isProfileMapped(profileName: string): boolean {
  return getProfileMapping(profileName) !== null;
}
