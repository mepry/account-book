/**
 * 거래 입력/수정 폼 (모달).
 * 날짜·시간, 금액(자체 숫자 키패드, 00/000/0000 키, 자동 콤마), 내역/상세/메모, 대>소 카테고리, 결제수단 + 할부,
 * 태그 자동완성(삭제한 태그는 메모 뒤로 옮김). 삭제는 날짜 내역 시트에서 길게 눌러서 한다.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import {
  addBenefitType,
  getBenefitTypes,
  getCategories,
  getPaymentMethods,
  getTransactionForEdit,
  saveTransaction,
  searchTags,
  type BenefitType,
  type Category,
  type PaymentMethod,
  type TxType,
} from '../db/queries';
import { useDb } from '../hooks/useDb';
import { bumpDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatNumber, parseAmount } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';
import { AmountKeypad } from './AmountKeypad';
import { DatePickerModal, OptionPicker, openTimePicker, type Option } from './Pickers';

/** 폼을 여는 방법: 새 입력(날짜·시간 기본값) 또는 수정(거래 id) */
export type FormTarget = { mode: 'new'; date: string; time: string } | { mode: 'edit'; id: number };

interface Props {
  type: TxType;
  target: FormTarget | null;
  onClose: () => void;
}

type PickerKind = 'major' | 'minor' | 'payment' | 'months' | null;

/** 혜택 입력 한 줄 */
interface BenefitRow {
  key: number;
  typeId: number | null;
  amountText: string;
}

/** 혜택 선택창의 "+ 새 혜택" 항목 값 */
const NEW_BENEFIT = -1;

let rowKey = 0;

/**
 * 혜택 입력 줄을 만든다.
 * @param typeId 혜택 종류 id
 * @param amount 금액
 */
const newRow = (typeId: number | null = null, amount = 0): BenefitRow => ({
  key: ++rowKey,
  typeId,
  amountText: amount ? formatNumber(amount) : '',
});

const MONTH_OPTIONS: Option<number>[] = [
  { label: '일시불', value: 1 },
  ...Array.from({ length: 23 }, (_, i) => ({ label: `${i + 2}개월 할부`, value: i + 2 })),
];

/**
 * 거래 입력/수정 폼.
 */
export function TransactionForm({ type, target, onClose }: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const [categories, setCategories] = useState<Category[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [benefitTypes, setBenefitTypes] = useState<BenefitType[]>([]);

  const [editId, setEditId] = useState<number | undefined>(undefined);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [amountText, setAmountText] = useState('');
  /** 금액 키패드 펼침 여부 */
  const [keypadOpen, setKeypadOpen] = useState(false);
  const titleRef = useRef<TextInputInstance>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [memo, setMemo] = useState('');
  const [benefitRows, setBenefitRows] = useState<BenefitRow[]>([]);
  const [benefitPickerKey, setBenefitPickerKey] = useState<number | null>(null);
  const [newBenefitKey, setNewBenefitKey] = useState<number | null>(null);
  const [newBenefitName, setNewBenefitName] = useState('');
  const [majorId, setMajorId] = useState<number | null>(null);
  const [minorId, setMinorId] = useState<number | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [months, setMonths] = useState(1);
  /** 폼에는 체크박스가 없고, 카테고리 기본 제외 반영·수정 시 기존 값 보존용으로만 쓴다 */
  const [excluded, setExcluded] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [picker, setPicker] = useState<PickerKind>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const majors = useMemo(() => categories.filter((c) => c.parent_id === null), [categories]);
  const minors = useMemo(() => categories.filter((c) => c.parent_id === majorId), [categories, majorId]);

  // 폼 열릴 때 초기화
  useEffect(() => {
    if (!target) return;
    let alive = true;
    (async () => {
      const [cats, pays, bts] = await Promise.all([getCategories(db, type), getPaymentMethods(db), getBenefitTypes(db)]);
      if (!alive) return;
      setCategories(cats);
      setPayments(pays);
      setBenefitTypes(bts);
      setTagInput('');
      setTagEditing(false);
      setSuggestions([]);
      if (target.mode === 'new') {
        setEditId(undefined);
        setDate(target.date);
        setTime(target.time);
        setAmountText('');
        // 새로 입력할 때는 금액부터 넣도록 키패드를 펼쳐 둔다
        setKeypadOpen(true);
        setTitle('');
        setDetail('');
        setMemo('');
        setBenefitRows([]);
        setMajorId(null);
        setMinorId(null);
        setPaymentId(pays[0]?.id ?? null);
        setMonths(1);
        setExcluded(false);
        setTags([]);
        return;
      }
      const tx = await getTransactionForEdit(db, target.id);
      if (!alive || !tx) return;
      const cat = cats.find((c) => c.id === tx.categoryId);
      setEditId(tx.id);
      setDate(tx.date);
      setTime(tx.time);
      setAmountText(formatNumber(tx.amount));
      setKeypadOpen(false);
      setTitle(tx.title);
      setDetail(tx.detail);
      setMemo(tx.memo);
      setBenefitRows(tx.benefits.map((b) => newRow(b.typeId, b.amount)));
      setMajorId(cat ? (cat.parent_id ?? cat.id) : null);
      setMinorId(cat && cat.parent_id !== null ? cat.id : null);
      setPaymentId(tx.paymentMethodId);
      setMonths(tx.installmentMonths);
      setExcluded(tx.excluded);
      setTags(tx.tags);
    })().catch((e) => log.error('폼 초기화 실패', e));
    return () => {
      alive = false;
    };
  }, [db, target, type]);

  // 태그 자동완성
  useEffect(() => {
    const q = tagInput.replace(/^#/, '').trim();
    if (!q) return;
    let alive = true;
    searchTags(db, q)
      .then((r) => alive && setSuggestions(r.filter((t) => !tags.includes(t))))
      .catch((e) => log.error('태그 검색 실패', e));
    return () => {
      alive = false;
    };
  }, [db, tagInput, tags]);

  /** 카테고리 변경 시 새 입력이면 "기본 제외" 설정을 반영한다. */
  const applyCategoryDefault = (major: number | null, minor: number | null): void => {
    if (editId !== undefined) return;
    const flag = [minor, major].some((id) => id !== null && byId.get(id)?.default_excluded === 1);
    setExcluded(flag);
  };

  const addTag = (raw: string): void => {
    const names = raw
      .split(/[\s,#]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (names.length) setTags((prev) => [...prev, ...names.filter((n) => !prev.includes(n))]);
    setTagInput('');
  };

  /** 입력 중인 태그를 확정하고 입력칸을 닫는다. */
  const finishTag = (): void => {
    if (tagInput.trim()) addTag(tagInput);
    setTagEditing(false);
  };

  /** 입력 중인 태그를 버리고 입력칸을 닫는다. */
  const cancelTag = (): void => {
    setTagInput('');
    setTagEditing(false);
  };

  /**
   * 태그를 지우고, 그 이름을 메모 맨 뒤에 붙인다 (예: 메모 "니트" + #포그블루 삭제 → "니트 포그블루").
   * @param tag 지울 태그 이름
   */
  const removeTag = (tag: string): void => {
    setTags((prev) => prev.filter((x) => x !== tag));
    setMemo((m) => (m.trim() ? `${m.trimEnd()} ${tag}` : tag));
  };

  /** 혜택 줄 하나를 고친다. */
  const updateRow = (key: number, patch: Partial<BenefitRow>): void =>
    setBenefitRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** 새 혜택 종류를 만들고, 그 종류를 해당 줄에 넣는다. */
  const createBenefitType = async (): Promise<void> => {
    const key = newBenefitKey;
    try {
      const id = await addBenefitType(db, newBenefitName);
      setBenefitTypes(await getBenefitTypes(db));
      if (key !== null) updateRow(key, { typeId: id });
      setNewBenefitKey(null);
    } catch (e) {
      log.error('혜택 추가 실패', e);
      Alert.alert('혜택을 추가하지 못했습니다', e instanceof Error ? e.message : String(e));
    }
  };

  const onTagChange = (text: string): void => {
    if (/[\s,]$/.test(text)) addTag(text);
    else setTagInput(text);
  };

  const save = async (): Promise<void> => {
    if (!amountText) {
      Alert.alert('금액을 입력하세요');
      return;
    }
    const pending = tagInput.trim() ? [...tags, tagInput.replace(/^#/, '').trim()] : tags;
    try {
      await saveTransaction(
        db,
        {
          type,
          date,
          time,
          amount: parseAmount(amountText),
          title,
          detail,
          memo,
          benefits: benefitRows
            .filter((r) => r.typeId !== null)
            .map((r) => ({ typeId: r.typeId as number, amount: r.amountText ? parseAmount(r.amountText) : 0 })),
          categoryId: minorId ?? majorId,
          paymentMethodId: paymentId,
          installmentMonths: type === 'expense' ? months : 1,
          excluded,
          tags: pending,
        },
        editId,
      );
      bumpDataVersion();
      onClose();
    } catch (e) {
      log.error('저장 실패', e);
      Alert.alert('저장하지 못했습니다', String(e));
    }
  };

  const label = type === 'expense' ? '지출' : '수입';
  const visibleSuggestions = tagInput.replace(/^#/, '').trim() ? suggestions : [];
  const paymentName = payments.find((p) => p.id === paymentId)?.name ?? '없음';
  const benefitName = (id: number | null): string => benefitTypes.find((b) => b.id === id)?.name ?? '선택';
  const pickingRow = benefitRows.find((r) => r.key === benefitPickerKey);

  return (
    <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="height" style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>
              {label}내역{editId !== undefined ? ' 수정' : ''}
            </Text>
            <Pressable style={styles.closeButton} hitSlop={10} onPress={onClose} accessibilityLabel="닫기">
              <Ionicons name="close" size={26} color={theme.colors.headerText} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Row label={`${label}일`}>
              <Box flex={3} onPress={() => setDateOpen(true)} text={date} />
              <Box flex={2} onPress={() => openTimePicker(time, setTime)} text={time} />
            </Row>
            <Row label={`${label}금액`}>
              {/* 휴대폰 키보드 대신 자체 키패드를 연다 */}
              <Pressable
                style={[styles.input, styles.amountBox, keypadOpen && styles.amountBoxOpen]}
                onPress={() => {
                  Keyboard.dismiss();
                  setKeypadOpen(!keypadOpen);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${label}금액 ${amountText || '입력'}`}
              >
                <Text style={[styles.amountText, !amountText && { color: theme.colors.subText }]}>
                  {amountText ? `${amountText}원` : '입력'}
                </Text>
              </Pressable>
            </Row>
            {keypadOpen ? (
              <AmountKeypad
                digits={amountText.replace(/\D/g, '')}
                onChange={(d) => setAmountText(d ? formatNumber(parseAmount(d)) : '')}
                onDone={() => {
                  setKeypadOpen(false);
                  // 다음 칸(내역)으로 바로 넘어간다
                  if (!title) titleRef.current?.focus();
                }}
              />
            ) : null}
            <Row label={`${label}내역`}>
              <TextInput
                ref={titleRef}
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                // 다른 칸을 누르면 키패드는 접는다
                onFocus={() => setKeypadOpen(false)}
              />
            </Row>
            <Row label="상세">
              <TextInput style={styles.input} value={detail} placeholder="선택" placeholderTextColor={theme.colors.subText} onChangeText={setDetail} />
            </Row>
            <Row label="카테고리">
              <Box flex={1} onPress={() => setPicker('major')} text={majorId ? byId.get(majorId)?.name ?? '없음' : '없음'} />
              <Box
                flex={1}
                onPress={() => majorId && setPicker('minor')}
                text={minorId ? byId.get(minorId)?.name ?? '없음' : '없음'}
              />
            </Row>
            <Row label="결제">
              <Box flex={3} onPress={() => setPicker('payment')} text={paymentName} />
              {type === 'expense' ? (
                <Box flex={2} onPress={() => setPicker('months')} text={months >= 2 ? `${months}개월` : '일시불'} />
              ) : null}
            </Row>
            <Row label="태그">
              <View style={{ flex: 1 }}>
                <View style={[styles.chips, styles.tagChips]}>
                  {tags.map((t) => (
                    <Pressable key={t} style={styles.chip} onPress={() => removeTag(t)}>
                      <Text style={styles.chipText}>#{t} ✕</Text>
                    </Pressable>
                  ))}
                  {!tagEditing ? (
                    <Pressable
                      style={[styles.chip, styles.addChip]}
                      onPress={() => setTagEditing(true)}
                      accessibilityLabel="태그 추가"
                    >
                      <Text style={styles.addChipText}>+ 추가</Text>
                    </Pressable>
                  ) : null}
                </View>
                {tagEditing ? (
                  <View style={styles.tagInputRow}>
                    <TextInput
                      style={styles.input}
                      value={tagInput}
                      placeholder="태그 입력"
                      placeholderTextColor={theme.colors.subText}
                      autoCapitalize="none"
                      autoFocus
                      onChangeText={onTagChange}
                      onSubmitEditing={finishTag}
                      submitBehavior="blurAndSubmit"
                    />
                    <Pressable style={styles.tagButton} onPress={cancelTag}>
                      <Text style={styles.addChipText}>취소</Text>
                    </Pressable>
                    <Pressable style={[styles.tagButton, styles.tagButtonPrimary]} onPress={finishTag}>
                      <Text style={styles.tagButtonPrimaryText}>확인</Text>
                    </Pressable>
                  </View>
                ) : null}
                {tagEditing && visibleSuggestions.length > 0 && (
                  <View style={styles.chips}>
                    {visibleSuggestions.map((s) => (
                      <Pressable key={s} style={[styles.chip, styles.suggestion]} onPress={() => addTag(s)}>
                        <Text style={styles.chipText}>#{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </Row>
            {type === 'expense' ? (
              <Row label="혜택">
                <View style={{ flex: 1, gap: 6 }}>
                  {benefitRows.map((r) => (
                    <View key={r.key} style={styles.benefitRow}>
                      <Box flex={3} onPress={() => setBenefitPickerKey(r.key)} text={benefitName(r.typeId)} />
                      <TextInput
                        style={[styles.input, styles.amount, { flex: 2 }]}
                        value={r.amountText}
                        placeholder="금액"
                        placeholderTextColor={theme.colors.subText}
                        keyboardType="number-pad"
                        onChangeText={(t) => updateRow(r.key, { amountText: t ? formatNumber(parseAmount(t)) : '' })}
                      />
                      <Pressable
                        hitSlop={8}
                        style={styles.removeRow}
                        onPress={() => setBenefitRows(benefitRows.filter((x) => x.key !== r.key))}
                        accessibilityLabel="혜택 삭제"
                      >
                        <Text style={styles.removeRowText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Pressable style={styles.addLine} onPress={() => setBenefitRows([...benefitRows, newRow()])}>
                    <Text style={styles.addChipText}>+ 혜택 추가</Text>
                  </Pressable>
                </View>
              </Row>
            ) : null}
            <Row label="메모">
              <TextInput style={[styles.input, { minHeight: 48 }]} value={memo} multiline onChangeText={setMemo} />
            </Row>
          </ScrollView>
          <View style={styles.buttons}>
            <Button text="취소" onPress={onClose} />
            <Button text="저장" onPress={save} />
          </View>
        </View>
      </KeyboardAvoidingView>

      <DatePickerModal visible={dateOpen} value={date} onSelect={setDate} onClose={() => setDateOpen(false)} />
      <OptionPicker
        visible={picker === 'major'}
        title="대분류"
        options={[{ label: '없음', value: null }, ...majors.map((c) => ({ label: c.name, value: c.id as number | null }))]}
        selected={majorId}
        onSelect={(v) => {
          setMajorId(v);
          setMinorId(null);
          applyCategoryDefault(v, null);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'minor'}
        title="소분류"
        options={[{ label: '없음', value: null }, ...minors.map((c) => ({ label: c.name, value: c.id as number | null }))]}
        selected={minorId}
        onSelect={(v) => {
          setMinorId(v);
          applyCategoryDefault(majorId, v);
        }}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={picker === 'payment'}
        title="결제수단"
        options={[{ label: '없음', value: null }, ...payments.map((p) => ({ label: p.name, value: p.id as number | null }))]}
        selected={paymentId}
        onSelect={setPaymentId}
        onClose={() => setPicker(null)}
      />
      <OptionPicker
        visible={pickingRow !== undefined}
        title="혜택"
        options={[
          ...benefitTypes.map((b) => ({ label: b.name, value: b.id })),
          { label: '+ 새 혜택', value: NEW_BENEFIT },
        ]}
        selected={pickingRow?.typeId ?? undefined}
        onSelect={(v) => {
          if (!pickingRow) return;
          if (v === NEW_BENEFIT) {
            setNewBenefitName('');
            setNewBenefitKey(pickingRow.key);
          } else updateRow(pickingRow.key, { typeId: v });
        }}
        onClose={() => setBenefitPickerKey(null)}
      />
      <Modal
        visible={newBenefitKey !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNewBenefitKey(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>새 혜택</Text>
            <View style={styles.body}>
              <TextInput
                style={styles.input}
                value={newBenefitName}
                placeholder="예) 카카오포인트"
                placeholderTextColor={theme.colors.subText}
                autoFocus
                onChangeText={setNewBenefitName}
                onSubmitEditing={createBenefitType}
              />
            </View>
            <View style={styles.buttons}>
              <Button text="취소" onPress={() => setNewBenefitKey(null)} />
              <Button text="추가" onPress={createBenefitType} />
            </View>
          </View>
        </View>
      </Modal>
      <OptionPicker
        visible={picker === 'months'}
        title="할부"
        options={MONTH_OPTIONS}
        selected={months}
        onSelect={setMonths}
        onClose={() => setPicker(null)}
      />
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

function Box({ text, onPress, flex }: { text: string; onPress: () => void; flex: number }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={[styles.input, styles.box, { flex }]} onPress={onPress}>
      <Text style={styles.boxText} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

/** 폼 하단 버튼 */
function Button({ text, onPress }: { text: string; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 },
    dialog: { backgroundColor: t.colors.bg, borderRadius: t.radius, maxHeight: '92%', overflow: 'hidden' },
    dialogHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.header, paddingRight: 14 },
    dialogTitle: { flex: 1, backgroundColor: t.colors.header, color: t.colors.headerText, fontSize: 20, fontWeight: '700', padding: 18 },
    closeButton: { padding: 4 },
    body: { padding: 14, gap: 10 },
    row: { flexDirection: 'row', alignItems: 'flex-start' },
    rowLabel: { width: 76, fontSize: 16, color: t.colors.text, paddingTop: 12 },
    rowBody: { flex: 1, flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 3,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 16,
      color: t.colors.text,
    },
    amount: { textAlign: 'center' },
    amountBox: { justifyContent: 'center', alignItems: 'center' },
    amountBoxOpen: { borderColor: t.colors.primary, borderWidth: 2 },
    amountText: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    box: { alignItems: 'center', justifyContent: 'center' },
    boxText: { fontSize: 16, color: t.colors.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    chip: { backgroundColor: t.colors.tagBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    suggestion: { backgroundColor: t.colors.surface, marginTop: 6 },
    tagChips: { minHeight: 44, alignItems: 'center', marginBottom: 0 },
    addChip: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, paddingVertical: 6 },
    addChipText: { fontSize: 14, color: t.colors.text },
    addLine: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.colors.border,
      borderRadius: 3,
      paddingVertical: 10,
      alignItems: 'center',
    },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    removeRow: { paddingHorizontal: 4 },
    removeRowText: { fontSize: 16, color: t.colors.subText },
    chipText: { fontSize: 13, color: t.colors.saturday },
    tagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tagButton: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 3,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
    },
    tagButtonPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
    tagButtonPrimaryText: { fontSize: 14, color: t.colors.onPrimary, fontWeight: '600' },
    buttons: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: t.colors.surface },
    button: { flex: 1, backgroundColor: t.colors.primary, borderRadius: Math.min(t.radius, 10), paddingVertical: 14, alignItems: 'center' },
    buttonText: { color: t.colors.onPrimary, fontSize: 17, fontWeight: '600' },
  });
