/**
 * 설정 화면의 "카드 문자 자동 추가" 영역: 켜기/끄기(문자 읽기 권한 요청), 해외 결제 환율.
 */
import { useEffect, useState } from 'react';
import { Alert, PermissionsAndroid, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { getSetting, setSetting } from '../db/queries';
import { getFxRates, setFxRates, SMS_AUTO_KEY, SMS_LAST_TS_KEY } from '../db/smsImport';
import { useDb } from '../hooks/useDb';
import { checkCardSms, smsImportAvailable } from '../hooks/useSmsAutoImport';
import { DEFAULT_FX_RATES } from '../lib/cardSms';
import { log } from '../lib/logger';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

/** 설정에서 고칠 수 있는 통화 */
const FX_CURRENCIES = Object.keys(DEFAULT_FX_RATES);

/**
 * 카드 문자 자동 추가 설정.
 */
export function SmsSettings() {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const [enabled, setEnabled] = useState(false);
  const [rates, setRates] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([getSetting(db, SMS_AUTO_KEY), getFxRates(db)])
      .then(([on, fx]) => {
        setEnabled(on === '1');
        setRates(Object.fromEntries(FX_CURRENCIES.map((c) => [c, String(fx[c] ?? '')])));
      })
      .catch((e) => log.error('카드 문자 설정 조회 실패', e));
  }, [db]);

  /** 켜면 문자 읽기 권한을 받고, 지금 이후 문자부터 반영한다. */
  const toggle = async (on: boolean): Promise<void> => {
    try {
      if (on) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('권한 필요', '문자 읽기 권한을 허용해야 카드 결제 문자를 읽을 수 있어요.\n(폰 설정 → 앱 → 가계부 → 권한)');
          return;
        }
        await setSetting(db, SMS_LAST_TS_KEY, String(Date.now()));
      }
      await setSetting(db, SMS_AUTO_KEY, on ? '1' : '0');
      setEnabled(on);
    } catch (e) {
      log.error('카드 문자 설정 저장 실패', e);
    }
  };

  /** 환율 입력을 저장한다 (숫자가 아니면 기본값으로). */
  const saveRates = (): void => {
    const parsed = Object.fromEntries(
      FX_CURRENCIES.map((c) => {
        const n = parseFloat((rates[c] ?? '').replace(/,/g, ''));
        return [c, Number.isFinite(n) && n > 0 ? n : DEFAULT_FX_RATES[c]];
      }),
    );
    setRates(Object.fromEntries(FX_CURRENCIES.map((c) => [c, String(parsed[c])])));
    setFxRates(db, parsed).catch((e) => log.error('환율 저장 실패', e));
  };

  if (!smsImportAvailable) {
    return <Text style={styles.help}>APK로 설치한 앱(안드로이드)에서만 쓸 수 있습니다. Expo Go에서는 동작하지 않아요.</Text>;
  }

  return (
    <View>
      <Text style={styles.help}>
        신한·삼성·현대·농협 카드 승인 문자가 오면 앱을 열 때 지출로 자동 추가합니다. 취소 문자가 오면 자동으로 넣은 같은 내역을 지웁니다.
        카테고리는 같은 가맹점의 지난번 값을 씁니다.
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>카드 문자 자동 추가</Text>
        <Switch value={enabled} onValueChange={(v) => void toggle(v)} />
      </View>
      {enabled ? (
        <Pressable style={styles.checkButton} onPress={() => void checkCardSms(db)}>
          <Text style={styles.checkText}>지금 새 문자 확인</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.help, { paddingTop: 12 }]}>해외 결제 환율 (1단위당 원, 메모에 원래 금액이 남아요)</Text>
      <View style={styles.fxRow}>
        {FX_CURRENCIES.map((c) => (
          <View key={c} style={styles.fxItem}>
            <Text style={styles.fxLabel}>{c}</Text>
            <TextInput
              style={styles.fxInput}
              value={rates[c] ?? ''}
              onChangeText={(v) => setRates((r) => ({ ...r, [c]: v }))}
              onEndEditing={saveRates}
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.subText}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    help: { fontSize: 13, color: t.colors.subText, paddingHorizontal: 16, paddingBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 4 },
    label: { fontSize: 15, color: t.colors.text, fontWeight: '600' },
    checkButton: {
      marginHorizontal: 16,
      marginTop: 6,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: t.radius,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    checkText: { fontSize: 14, color: t.colors.text },
    fxRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    fxItem: { flex: 1 },
    fxLabel: { fontSize: 12, color: t.colors.subText, marginBottom: 4 },
    fxInput: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      color: t.colors.text,
    },
  });
