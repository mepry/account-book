/**
 * 앱 공용 로거 (react-native-logs).
 * console.log 대신 이 로거를 사용한다.
 */
import { consoleTransport, logger as rnLogger } from 'react-native-logs';

const isTest = typeof process !== 'undefined' && process.env?.JEST_WORKER_ID !== undefined;

/** 앱 로거 인스턴스. 테스트 중에는 warn 이상만 출력한다. */
export const log = rnLogger.createLogger({
  severity: isTest ? 'warn' : typeof __DEV__ !== 'undefined' && __DEV__ ? 'debug' : 'info',
  transport: consoleTransport,
  async: !isTest,
});
