/**
 * 문자함 읽기 네이티브 모듈 (안드로이드 전용).
 * Expo Go나 다른 플랫폼에는 이 모듈이 없으므로 null이 된다 → 화면에서 "APK에서만 동작"으로 안내.
 */
import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** 받은 카드 결제 문자 */
export interface InboxMessage {
  body: string;
  /** 받은 시각 (ms) */
  date: number;
}

interface SmsInboxNative {
  getCardMessagesSince(since: number): Promise<InboxMessage[]>;
  addListener(event: 'onChange', listener: () => void): EventSubscription;
}

/** 네이티브 모듈 (없으면 null) */
export const SmsInbox = requireOptionalNativeModule<SmsInboxNative>('SmsInbox');
