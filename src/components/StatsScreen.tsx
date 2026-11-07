/**
 * 통계 화면: 필터(카테고리·결제수단·검색어, 화면 전체에 적용), 기간(기본 이번 달, 버튼 → 월별/연별/사용자 지정),
 * 지출/수입, 제외 포함 토글,
 * 카테고리 도넛 차트(캡션 xx%, 누르면 상세 레이어) → 지출(수입)내역별 합계(헤더로 정렬)
 * → 최근 12개월 막대 차트(막대 누르면 그 달 카테고리별 레이어, 카테고리 누르면 내역 펼침).
 * 할부는 분할 건 기준 (v_ledger).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ALL_CATEGORIES,
  getCategories,
  getCategoryTotals,
  getMonthlyTotals,
  getPaymentMethods,
  getTitleTotals,
  type CategoryItem,
  type CategoryTotal,
  type StatsFilter,
  type TitleTotal,
  type TxType,
} from '../db/queries';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useDb } from '../hooks/useDb';
import { useDataVersion } from '../lib/dataVersion';
import { lastDayOfMonth, parseYmd, today as todayFn, ymd } from '../lib/date';
import { log } from '../lib/logger';
import { formatNumber, formatWon } from '../lib/money';
import { average, median } from '../lib/stats';
import type { Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';
import { CategoryDetailSheet, type CategoryDetailTarget } from './CategoryDetailSheet';
import { CategoryPie, type PieItem } from './CategoryPie';
import { KeywordFilterModal } from './KeywordFilterModal';
import { MonthCategorySheet } from './MonthCategorySheet';
import { DatePickerModal, OptionPicker, type Option } from './Pickers';
import { TitleTotalsList } from './TitleTotalsList';
import { TodayButton, TopBar } from './TopBar';
import { TransactionForm, type FormTarget } from './TransactionForm';

type Mode = 'month' | 'year' | 'custom';

/** 목록에서 고르는 필터 종류 */
type PickKind = 'categoryId' | 'paymentMethodId';

const PICK_TITLES: Record<PickKind, string> = {
  categoryId: '카테고리',
  paymentMethodId: '결제수단',
};

/** 기간 선택 레이어 항목 */
const MODE_OPTIONS: { label: string; value: Mode; sub: string }[] = [
  { label: '월별', value: 'month', sub: '한 달 단위로 보기' },
  { label: '연별', value: 'year', sub: '1년 단위로 보기' },
  { label: '사용자 지정', value: 'custom', sub: '시작일·종료일을 직접 고르기' },
];

/**
 * YYYY-MM에 개월 수를 더한다.
 */
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map((s) => parseInt(s, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** 큰 금액을 축 라벨용으로 줄인다. 예) 1250000 → 125만 */
const shortWon = (v: number): string => (v >= 10000 ? `${formatNumber(Math.round(v / 10000))}만` : formatNumber(v));

/**
 * 통계 탭 화면.
 */
export function StatsScreen() {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const version = useDataVersion();
  const confirmDelete = useConfirmDelete();
  const { width } = useWindowDimensions();
  const today = todayFn();

  const [type, setType] = useState<TxType>('expense');
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(today.slice(0, 7)); // month: YYYY-MM, year: YYYY-MM(연도만 사용)
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [dateEdit, setDateEdit] = useState<'from' | 'to' | null>(null);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [detail, setDetail] = useState<CategoryDetailTarget | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [filter, setFilter] = useState<StatsFilter>({});
  const [pickOpen, setPickOpen] = useState<PickKind | null>(null);
  const [keywordOpen, setKeywordOpen] = useState(false);
  const [pickOptions, setPickOptions] = useState<Record<PickKind, Option<number | null>[]>>({
    categoryId: [],
    paymentMethodId: [],
  });
  /** 막대를 눌러 연 달 (YYYY-MM) */
  const [barYm, setBarYm] = useState<string | null>(null);
  /** 내역 이름 말풍선을 보는 동안 스크롤 잠금 */
  const [scrollLocked, setScrollLocked] = useState(false);

  const [cats, setCats] = useState<CategoryTotal[]>([]);
  const [monthly, setMonthly] = useState<Record<string, number>>({});
  const [titles, setTitles] = useState<TitleTotal[]>([]);

  const { from, to, label } = useMemo(() => {
    if (mode === 'custom') return { from: customFrom, to: customTo, label: `${customFrom} ~ ${customTo}` };
    const { year, month } = parseYmd(`${anchor}-01`);
    if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}년` };
    const f = ymd(year, month, 1);
    const t = ymd(year, month, lastDayOfMonth(year, month));
    return { from: f, to: t, label: `${year}년 ${month}월` };
  }, [mode, anchor, customFrom, customTo]);

  // 필터 고를 목록 (카테고리는 지출/수입에 따라 다름)
  useEffect(() => {
    let alive = true;
    const all: Option<number | null> = { label: '전체', value: null };
    Promise.all([getCategories(db, type), getPaymentMethods(db)])
      .then(([cs, pms]) => {
        if (!alive) return;
        const names = new Map(cs.map((c) => [c.id, c.name]));
        // 대분류 바로 아래에 그 소분류들이 오도록 정렬
        const tops = cs.filter((c) => c.parent_id === null);
        const ordered = tops.flatMap((top) => [top, ...cs.filter((c) => c.parent_id === top.id)]);
        setPickOptions({
          categoryId: [
            all,
            ...ordered.map((c) => ({
              label: c.parent_id === null ? c.name : `${names.get(c.parent_id)} > ${c.name}`,
              value: c.id,
              sub: c.parent_id === null ? '소분류 포함' : undefined,
            })),
          ],
          paymentMethodId: [all, ...pms.map((p) => ({ label: p.name, value: p.id }))],
        });
      })
      .catch((e) => log.error('필터 목록 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, type, version]);

  /** 목록 필터 칩에 보일 이름 (없으면 null) */
  const pickLabel = (kind: PickKind): string | null => {
    const v = filter[kind];
    if (v == null) return null;
    return pickOptions[kind].find((o) => o.value === v)?.label ?? null;
  };
  const keyword = filter.keyword ?? '';
  const hasFilter = filter.categoryId != null || filter.paymentMethodId != null || keyword !== '';

  /** 지출/수입을 바꾼다. 카테고리는 종류마다 달라서 카테고리 필터는 푼다. */
  const changeType = (t: TxType): void => {
    if (t !== type) setFilter((f) => ({ ...f, categoryId: null }));
    setType(t);
  };

  const endYm = to.slice(0, 7);
  const months12 = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftYm(endYm, i - 11)), [endYm]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      // 기간 안에 내역이 있으면 0원(0%)이어도 차트에 나온다
      getCategoryTotals(db, type, from, to, includeExcluded, filter),
      getMonthlyTotals(db, type, months12[0], months12[11], includeExcluded, filter),
      getTitleTotals(db, type, from, to, includeExcluded, filter),
    ])
      .then(([c, m, t]) => {
        if (!alive) return;
        setCats(c);
        setMonthly(m);
        setTitles(t);
      })
      .catch((e) => log.error('통계 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, type, from, to, includeExcluded, months12, filter, version]);

  const pieItems: PieItem[] = cats.map((c, i) => ({
    key: `${c.id}`,
    name: c.name,
    value: c.total,
    color: c.total > 0 ? theme.chartPalette[i % theme.chartPalette.length] : theme.colors.muted,
  }));
  const total = cats.reduce((s, c) => s + c.total, 0);

  /** 캡션·조각을 누르면 그 카테고리 상세 레이어를 연다. */
  const openDetail = (index: number): void => {
    const c = cats[index];
    setDetail({
      id: c.id,
      name: c.name,
      total: c.total,
      percent: total > 0 ? Math.round((c.total / total) * 100) : 0,
      color: pieItems[index].color,
    });
  };

  /** 가운데 총 합계를 누르면 기간 전체 내역 레이어를 연다. */
  const openAll = (): void =>
    setDetail({ id: ALL_CATEGORIES, name: '전체', total, percent: 100, color: theme.colors.primary });

  /** 상세·월별 레이어에서 내역을 길게 누르면 삭제 확인 (할부는 전체 회차). */
  const deleteItem = (item: CategoryItem): void => confirmDelete(item.edit_id, item.installment_seq !== null);

  /** 기간 종류를 바꾼다. 사용자 지정은 지금 보고 있는 기간에서 시작한다. */
  const changeMode = (m: Mode): void => {
    if (m === 'custom' && mode !== 'custom') {
      setCustomFrom(from);
      setCustomTo(to);
    }
    setMode(m);
  };
  const barData = months12.map((ym) => ({
    value: monthly[ym] ?? 0,
    label: `${parseInt(ym.slice(5), 10)}월`,
    frontColor: ym === endYm ? theme.colors.primary : theme.colors.muted,
  }));

  const monthValues = months12.map((ym) => monthly[ym] ?? 0);
  // 기간·필터가 바뀌면 내역 목록을 처음 개수로 되돌리기 위한 key (정렬도 기본으로)
  const listKey = `${type}|${from}|${to}|${includeExcluded}|${JSON.stringify(filter)}`;

  /** TODAY: 오늘이 있는 달로 이동 (연별이면 올해, 사용자 지정이면 월별로 바꿔서). */
  const goToday = (): void => {
    if (mode === 'custom') setMode('month');
    setAnchor(today.slice(0, 7));
  };
  const step = (delta: number): void => setAnchor(shiftYm(anchor, mode === 'year' ? delta * 12 : delta));
  const listTitle = type === 'expense' ? '지출내역' : '수입내역';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 기간 선택은 상단바에 두어 스크롤을 내려도 바로 바꿀 수 있게 한다 */}
      <TopBar title="통계" titleAccessory={<TodayButton onPress={goToday} />}>
        <View style={styles.period}>
          {mode === 'custom' ? (
            <>
              <HeaderButton text={customFrom.slice(2).replace(/-/g, '.')} onPress={() => setDateEdit('from')} />
              <Text style={styles.periodText}>~</Text>
              <HeaderButton text={customTo.slice(2).replace(/-/g, '.')} onPress={() => setDateEdit('to')} />
              <HeaderButton text="▾" onPress={() => setModeOpen(true)} accessibilityLabel="기간 종류 선택" />
            </>
          ) : (
            <>
              <HeaderButton icon="chevron-back" onPress={() => step(-1)} accessibilityLabel="이전 기간" />
              <HeaderButton text={`${label} ▾`} onPress={() => setModeOpen(true)} accessibilityLabel="기간 선택" />
              <HeaderButton icon="chevron-forward" onPress={() => step(1)} accessibilityLabel="다음 기간" />
            </>
          )}
        </View>
      </TopBar>
      <ScrollView
        style={{ backgroundColor: theme.colors.bg }}
        contentContainerStyle={{ paddingBottom: 32 }}
        // 내역 이름을 길게 눌러 보는 동안은 스크롤을 막아 말풍선이 닫히지 않게 한다
        scrollEnabled={!scrollLocked}
      >
        <View style={styles.segments}>
          {(['expense', 'income'] as const).map((t) => (
            <Segment key={t} active={type === t} text={t === 'expense' ? '지출' : '수입'} onPress={() => changeType(t)} />
          ))}
        </View>

        {/* 필터: 걸면 아래 통계 전체(차트·월별·내역 목록·상세)를 다시 계산한다 */}
        <View style={styles.filters}>
          {(['categoryId', 'paymentMethodId'] as const).map((kind) => {
            const name = pickLabel(kind);
            return (
              <FilterChip
                key={kind}
                text={`${name ?? PICK_TITLES[kind]} ▾`}
                active={name !== null}
                onPress={() => setPickOpen(kind)}
                accessibilityLabel={`${PICK_TITLES[kind]} 필터${name ? ` ${name}` : ''}`}
              />
            );
          })}
          <FilterChip
            text={keyword ? `“${keyword}”` : '검색 🔍'}
            active={keyword !== ''}
            onPress={() => setKeywordOpen(true)}
            accessibilityLabel={`검색 필터${keyword ? ` ${keyword}` : ''}`}
          />
          {hasFilter ? (
            <Pressable style={styles.filterClear} hitSlop={6} onPress={() => setFilter({})} accessibilityLabel="필터 모두 해제">
              <Text style={styles.filterClearText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={styles.toggle}
          onPress={() => setIncludeExcluded(!includeExcluded)}
          accessibilityRole="switch"
          accessibilityState={{ checked: includeExcluded }}
        >
          <Text style={styles.toggleText}>{includeExcluded ? '☑' : '☐'} 제외 항목 포함</Text>
        </Pressable>

        {/* 카테고리 원형 차트 */}
        <Text style={styles.section}>카테고리별</Text>
        {cats.length > 0 ? (
          <View style={styles.pieWrap}>
            <CategoryPie items={pieItems} width={width - 8} onPressItem={openDetail} onPressTotal={openAll} />
          </View>
        ) : (
          <Text style={styles.empty}>{hasFilter ? '필터에 맞는 내역이 없습니다' : '이 기간에 내역이 없습니다'}</Text>
        )}
        {cats.length > 0 ? (
          <Text style={styles.caption}>조각·캡션을 누르면 그 카테고리, 가운데 총 합계를 누르면 전체 내역을 볼 수 있어요</Text>
        ) : null}

        {/* 내역(title)별 합계: 헤더를 누르면 정렬 */}
        <Text style={styles.section}>
          {listTitle} <Text style={styles.sectionCount}>{titles.length}개</Text>
        </Text>
        <TitleTotalsList key={listKey} rows={titles} pageSize={5} onPeekChange={setScrollLocked} />

        {/* 월별 막대 차트 */}
        <Text style={styles.section}>월별 (최근 12개월)</Text>
        <View style={{ paddingLeft: 8 }}>
          <BarChart
            data={barData}
            // 막대를 누르면 그 달 카테고리별 레이어
            onPress={(_item: unknown, index: number) => setBarYm(months12[index])}
            width={width - 90}
            height={180}
            barWidth={Math.max(10, (width - 120) / 12 - 8)}
            spacing={8}
            initialSpacing={6}
            noOfSections={4}
            yAxisLabelWidth={44}
            formatYLabel={(v: string) => shortWon(Number(v))}
            yAxisTextStyle={{ fontSize: 10, color: theme.colors.subText }}
            xAxisLabelTextStyle={{ fontSize: 10, color: theme.colors.subText }}
            yAxisThickness={0}
            xAxisColor={theme.colors.border}
            rulesColor={theme.colors.border}
          />
        </View>
        <View style={styles.summary}>
          <Text style={styles.caption}>
            {months12[0]} ~ {months12[11]} · 막대를 누르면 그 달 카테고리별로 볼 수 있어요
          </Text>
          <View style={styles.summaryRow}>
            <SummaryItem label="합계" value={monthValues.reduce((s, v) => s + v, 0)} />
            <SummaryItem label="월평균" value={average(monthValues)} />
            <SummaryItem label="중간값" value={median(monthValues)} />
          </View>
        </View>
      </ScrollView>

      <DatePickerModal
        visible={dateEdit !== null}
        value={dateEdit === 'from' ? customFrom : customTo}
        onSelect={(d) => (dateEdit === 'from' ? setCustomFrom(d) : setCustomTo(d))}
        onClose={() => setDateEdit(null)}
      />
      <OptionPicker
        visible={pickOpen !== null}
        title={pickOpen ? `${PICK_TITLES[pickOpen]} 필터` : ''}
        options={pickOpen ? pickOptions[pickOpen] : []}
        selected={pickOpen ? (filter[pickOpen] ?? null) : null}
        onSelect={(v) => pickOpen && setFilter((f) => ({ ...f, [pickOpen]: v }))}
        onClose={() => setPickOpen(null)}
      />
      <KeywordFilterModal
        visible={keywordOpen}
        value={keyword}
        onApply={(k) => setFilter((f) => ({ ...f, keyword: k }))}
        onClose={() => setKeywordOpen(false)}
      />
      <OptionPicker
        visible={modeOpen}
        title="기간 선택"
        options={MODE_OPTIONS}
        selected={mode}
        onSelect={changeMode}
        onClose={() => setModeOpen(false)}
      />
      <CategoryDetailSheet
        // 수정 폼이 열려 있는 동안은 상세 레이어를 내려 두 모달이 겹치지 않게 한다
        target={form ? null : detail}
        type={type}
        from={from}
        to={to}
        includeExcluded={includeExcluded}
        filter={filter}
        onClose={() => setDetail(null)}
        onPressItem={(id) => setForm({ mode: 'edit', id })}
        onLongPressItem={deleteItem}
      />
      <MonthCategorySheet
        // 수정 폼이 열려 있는 동안은 내려 두어 두 모달이 겹치지 않게 한다
        ym={form ? null : barYm}
        type={type}
        includeExcluded={includeExcluded}
        filter={filter}
        onClose={() => setBarYm(null)}
        onPressItem={(id) => setForm({ mode: 'edit', id })}
        onLongPressItem={deleteItem}
      />
      <TransactionForm type={type} target={form} onClose={() => setForm(null)} />
    </SafeAreaView>
  );
}

function Segment({ active, text, onPress }: { active: boolean; text: string; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={[styles.segment, active && styles.segmentActive]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{text}</Text>
    </Pressable>
  );
}

/** 상단 필터 칩 */
function FilterChip({
  text,
  active,
  onPress,
  accessibilityLabel,
}: {
  text: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={[styles.filterChip, active && styles.filterChipOn]} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <Text style={[styles.filterText, active && styles.filterTextOn]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

/** 월별 차트 아래 요약 한 칸 */
function SummaryItem({ label, value }: { label: string; value: number }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatWon(value)}
      </Text>
    </View>
  );
}

/** 상단바 기간 버튼 (글자 또는 아이콘) */
function HeaderButton({
  text,
  icon,
  onPress,
  accessibilityLabel,
}: {
  text?: string;
  icon?: 'chevron-back' | 'chevron-forward';
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.periodButton} hitSlop={6} onPress={onPress} accessibilityLabel={accessibilityLabel ?? text}>
      {icon ? (
        <Ionicons name={icon} size={22} color={theme.colors.headerText} />
      ) : (
        <Text style={styles.periodText} numberOfLines={1}>
          {text}
        </Text>
      )}
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.colors.header },
    // 상단바 바로 아래가 답답해 보이지 않게 위쪽 여백을 넉넉히 둔다
    segments: { flexDirection: 'row', padding: 6, paddingTop: 14, gap: 6 },
    segment: { flex: 1, paddingVertical: 10, borderRadius: t.radius, backgroundColor: t.colors.surface, alignItems: 'center' },
    segmentActive: { backgroundColor: t.colors.primary },
    segmentText: { fontSize: 15, color: t.colors.text },
    segmentTextActive: { color: t.colors.onPrimary, fontWeight: '700' },
    filters: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingBottom: 6 },
    filterChip: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: t.radius,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
    },
    filterChipOn: { borderColor: t.colors.primary, backgroundColor: t.colors.surface },
    filterText: { fontSize: 13, color: t.colors.subText },
    filterTextOn: { color: t.colors.text, fontWeight: '700' },
    filterClear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    filterClearText: { fontSize: 16, color: t.colors.subText },
    summary: { paddingHorizontal: 16, paddingTop: 6 },
    summaryRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    summaryItem: { flex: 1, backgroundColor: t.colors.surface, borderRadius: t.radius, paddingVertical: 8, paddingHorizontal: 10 },
    summaryLabel: { fontSize: 12, color: t.colors.subText },
    summaryValue: { fontSize: 15, fontWeight: '700', color: t.colors.text, marginTop: 2 },
    period: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    periodButton: { paddingHorizontal: 6, paddingVertical: 6 },
    periodText: { fontSize: 16, fontWeight: '600', color: t.colors.headerText },
    toggle: { paddingHorizontal: 12, paddingVertical: 10 },
    toggleText: { fontSize: 14, color: t.colors.text },
    section: { fontSize: 17, fontWeight: '700', color: t.colors.text, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
    sectionCount: { fontSize: 13, fontWeight: '400', color: t.colors.subText },
    pieWrap: { alignItems: 'center', paddingVertical: 8 },
    empty: { textAlign: 'center', color: t.colors.subText, paddingVertical: 16 },
    caption: { fontSize: 12, color: t.colors.subText, paddingHorizontal: 16, paddingTop: 6 },
  });
