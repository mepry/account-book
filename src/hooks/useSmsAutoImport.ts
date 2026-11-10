/**
 * 카드 결제 문자 자동 추가: 앱이 열리거나 앞으로 나올 때, 그리고 앱이 켜진 채 문자함이 바뀔 때
 * 마지막 확인 이후의 카드 문자를 읽어 지출로 넣는다. 설정에서 켠 경우에만 동작한다.
 */
import { useEffect } from 'react';
import { AppState, PermissionsAndroid, Platform, ToastAndroid } from 'react-native';
import { SmsInbox } from '../../modules/sms-inbox';
import type { SqlDb } from '../db/adapter';
import { getSetting } from '../db/queries';
import { importCardSmsBatch, SMS_AUTO_KEY, SMS_LAST_TS_KEY } from '../db/smsImport';
import { bumpDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatNumber } from '../lib/money';
import { useDb } from './useDb';

/** 이 기기에서 카드 문자 자동 추가를 쓸 수 있는지 (안드로이드 APK에만 네이티브 모듈이 있다) */
export const smsImportAvailable = Platform.OS === 'android' && SmsInbox !== null;

/** 동시에 두 번 돌지 않게 하는 진행 중 작업 */
let running: Promise<void> | null = null;

/**
 * 새 카드 문자를 확인해서 반영한다. 꺼져 있거나 권한이 없으면 아무것도 하지 않는다.
 * @param db DB
 */
export function checkCardSms(db: SqlDb): Promise<void> {
  running ??= (async () => {
    try {
      if (!smsImportAvailable || !SmsInbox) return;
      if ((await getSetting(db, SMS_AUTO_KEY)) !== '1') return;
      if (!(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS))) return;
      const since = Number((await getSetting(db, SMS_LAST_TS_KEY)) ?? Date.now());
      const messages = await SmsInbox.getCardMessagesSince(since);
      if (messages.length === 0) return;
      const { added, cancelled } = await importCardSmsBatch(db, messages);
      if (added + cancelled === 0) return;
      bumpDataVersion();
      const parts = [added ? `${formatNumber(added)}건 추가` : '', cancelled ? `취소 ${formatNumber(cancelled)}건 반영` : ''];
      ToastAndroid.show(`카드 문자: ${parts.filter(Boolean).join(', ')}`, ToastAndroid.SHORT);
    } catch (e) {
      log.error('카드 문자 자동 추가 실패', e);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * 루트에서 한 번 부른다. 앱 시작·포그라운드 복귀·문자함 변경 때 확인한다.
 */
export function useSmsAutoImport(): void {
  const db = useDb();
  useEffect(() => {
    if (!smsImportAvailable || !SmsInbox) return;
    void checkCardSms(db);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void checkCardSms(db);
    });
    // 문자함은 문자 한 건에도 여러 번 바뀌므로 잠깐 모아서 확인한다
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inbox = SmsInbox.addListener('onChange', () => {
      clearTimeout(timer);
      timer = setTimeout(() => void checkCardSms(db), 1500);
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      inbox.remove();
    };
  }, [db]);
}
