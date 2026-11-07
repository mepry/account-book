/**
 * 앱 설정: app.json을 기본으로 쓰고, 로컬 전용 app.local.json이 있으면 개인 값(Expo 계정, 패키지 이름, EAS 프로젝트 ID)을 덮어쓴다.
 * app.local.json은 git에 올리지 않는다. 처음 쓰는 사람은 app.local.example.json을 복사해 자기 값으로 채운다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** app.local.json 형식 */
interface LocalConfig {
  owner?: string;
  androidPackage?: string;
  projectId?: string;
}

/**
 * app.local.json을 읽는다. 없으면 빈 값.
 * @returns 로컬 설정
 */
function readLocalConfig(): LocalConfig {
  const path = join(__dirname, 'app.local.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as LocalConfig) : {};
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const local = readLocalConfig();
  return {
    ...config,
    name: config.name ?? '가계부',
    slug: config.slug ?? 'account-book',
    ...(local.owner ? { owner: local.owner } : {}),
    android: {
      ...config.android,
      ...(local.androidPackage ? { package: local.androidPackage } : {}),
    },
    extra: {
      ...config.extra,
      ...(local.projectId ? { eas: { ...config.extra?.eas, projectId: local.projectId } } : {}),
    },
  };
};
