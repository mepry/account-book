/**
 * 이름별 합계 목록: 헤더(이름/건수/금액)를 누르면 정렬, 30개씩 더 보기 (pageSize를 주면 이전/다음 페이지).
 * renderExpanded를 주면 줄을 눌렀을 때 바로 아래로 펼쳐지고, 다시 누르면 접힌다.
 * 줄을 길게 누르고 있으면 잘린 이름 전체를 말풍선으로 보여준다.
 * 통계 화면 하단(지출내역)과 월별 막대 상세(카테고리별)에서 같이 쓴다.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWon } from '../lib/money';
import { DEFAULT_SORT, nextSort, sortTitleTotals, titleWithDetail, type TitleSort, type TitleSortKey } from '../lib/stats';
import { type Theme } from '../theme';
import { useStyles } from '../lib/theme';

/** 한 번에 보여주는 개수 */
const PAGE = 30;

export interface TotalsRow {
  /** 줄 구분용 (없으면 name) */
  key?: string;
  name: string;
  total: number;
  count: number;
  /** 이름 뒤 괄호에 붙일 상세 (", "로 묶은 것) */
  details?: string;
}

interface Props<T extends TotalsRow> {
  rows: T[];
  /** 첫 열 헤더 이름 (기본 '내역') */
  nameHeader?: string;
  /** 주면 줄을 눌러 펼치기/접기. 펼친 줄 아래에 그릴 내용 */
  renderExpanded?: (row: T) => ReactNode;
  /** 길게 눌러 전체 이름을 보는 중인지 (true면 부모 ScrollView 스크롤을 잠근다) */
  onPeekChange?: (peeking: boolean) => void;
  /** 주면 한 페이지에 이만큼씩 보여주고 이전/다음 페이지로 넘긴다 (없으면 30개씩 "더 보기") */
  pageSize?: number;
}

const rowKey = (r: TotalsRow): string => r.key ?? r.name;

/**
 * 정렬 가능한 합계 목록. 목록이 바뀌면(기간·필터 변경) 부모가 key를 바꿔 처음 상태로 되돌린다.
 */
export function TitleTotalsList<T extends TotalsRow>({ rows, nameHeader = '내역', renderExpanded, onPeekChange, pageSize }: Props<T>) {
  const styles = useStyles(makeStyles);
  const [sort, setSort] = useState<TitleSort>(DEFAULT_SORT);
  const [shown, setShown] = useState(PAGE);
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** 길게 눌러 전체 이름을 보고 있는 줄 */
  const [peekKey, setPeekKey] = useState<string | null>(null);
  /** 페이지 모드일 때 지금 페이지 (0부터) */
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => sortTitleTotals(rows, sort), [rows, sort]);
  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // 수정·삭제로 줄 수가 줄어 마지막 페이지가 사라져도 빈 화면이 되지 않게 한다
  const curPage = Math.min(page, pageCount - 1);
  /** 이전/다음 페이지로 넘기는 중인지 (페이지가 2개 이상) */
  const paged = pageSize !== undefined && pageCount > 1;
  /** 페이지 모드에서 목록 영역 최소 높이 (가장 꽉 찬 페이지 높이) */
  const [pageHeight, setPageHeight] = useState(0);
  const visible = pageSize ? sorted.slice(curPage * pageSize, (curPage + 1) * pageSize) : sorted.slice(0, shown);

  /** 헤더를 눌렀을 때: 정렬을 바꾸고 처음 개수(첫 페이지)로 돌아간다. */
  const pressHeader = (key: TitleSortKey): void => {
    setSort(nextSort(sort, key));
    setShown(PAGE);
    setPage(0);
  };

  /** 페이지를 옮긴다. 펼친 줄은 접는다. */
  const goPage = (p: number): void => {
    setPage(p);
    setOpenKey(null);
  };

  /** 말풍선을 띄우고, 부모에게 스크롤을 잠그라고 알린다 (스크롤이 터치를 가져가면 말풍선이 닫히므로). */
  const startPeek = (k: string): void => {
    setPeekKey(k);
    onPeekChange?.(true);
  };

  /** 손가락을 떼면 말풍선을 닫고 스크롤을 푼다. */
  const endPeek = (): void => {
    if (peekKey === null) return;
    setPeekKey(null);
    onPeekChange?.(false);
  };

  if (rows.length === 0) return <Text style={styles.empty}>내역이 없습니다</Text>;

  return (
    <>
      <View style={[styles.row, styles.headerRow]}>
        <SortHeader text={nameHeader} sortKey="name" sort={sort} onPress={pressHeader} style={styles.name} />
        <SortHeader text="건수" sortKey="count" sort={sort} onPress={pressHeader} style={styles.count} />
        <SortHeader text="금액" sortKey="total" sort={sort} onPress={pressHeader} style={styles.amount} />
      </View>
      {/* 페이지 모드: 지금까지 그려진 페이지 중 가장 높은 높이를 최소 높이로 잡아,
          마지막 페이지가 덜 차도 아래 버튼·차트가 올라오지 않게 한다 */}
      <View
        style={paged ? { minHeight: pageHeight } : null}
        onLayout={
          paged
            ? (e) => {
                const h = e.nativeEvent.layout.height;
                setPageHeight((prev) => Math.max(prev, h));
              }
            : undefined
        }
      >
        {visible.map((t, i) => {
          const k = rowKey(t);
          const open = renderExpanded !== undefined && openKey === k;
          const fullName = titleWithDetail(t.name, t.details);
          const peeking = peekKey === k;
          return (
            <View
              key={k}
              style={peeking ? styles.peekingRow : null}
              // 말풍선은 손가락을 뗄 때 닫는다 (위아래로 움직여도 누르고 있는 동안은 유지)
              onTouchEnd={endPeek}
              onTouchCancel={endPeek}
            >
              <Pressable
                style={[styles.row, open && styles.rowOpen, peeking && styles.rowPressed]}
                onPress={renderExpanded ? () => setOpenKey(open ? null : k) : undefined}
                // 길게 누르고 있는 동안 잘린 이름 전체를 말풍선으로 보여준다
                onLongPress={() => startPeek(k)}
                accessibilityRole={renderExpanded ? 'button' : undefined}
                accessibilityState={renderExpanded ? { expanded: open } : undefined}
                accessibilityLabel={fullName}
              >
                <Text style={[styles.name, styles.nameText]} numberOfLines={1}>
                  {renderExpanded ? (open ? '▾ ' : '▸ ') : ''}
                  {fullName}
                </Text>
                <Text style={[styles.count, styles.countText]}>{t.count}건</Text>
                <Text style={[styles.amount, styles.amountText]}>{formatWon(t.total)}</Text>
              </Pressable>
              {peeking ? (
                // 첫 줄은 위에 공간이 없으니 아래에 띄운다
                <View style={[styles.bubble, i === 0 ? styles.bubbleBelow : styles.bubbleAbove]} pointerEvents="none">
                  <Text style={styles.bubbleText}>{fullName}</Text>
                </View>
              ) : null}
              {open && renderExpanded ? <View style={styles.expanded}>{renderExpanded(t)}</View> : null}
            </View>
          );
        })}
      </View>
      {paged ? (
        <View style={styles.pager}>
          <PageButton text="‹ 이전" disabled={curPage === 0} onPress={() => goPage(curPage - 1)} />
          <Text style={styles.pageText}>
            {curPage + 1} / {pageCount}
          </Text>
          <PageButton text="다음 ›" disabled={curPage >= pageCount - 1} onPress={() => goPage(curPage + 1)} />
        </View>
      ) : null}
      {!pageSize && sorted.length > shown ? (
        <Pressable style={styles.more} onPress={() => setShown(shown + PAGE)}>
          <Text style={styles.moreText}>더 보기 ({sorted.length - shown}개 남음)</Text>
        </Pressable>
      ) : null}
    </>
  );
}

/** 이전/다음 페이지 버튼 (끝이면 흐리게, 눌리지 않음) */
function PageButton({ text, disabled, onPress }: { text: string; disabled: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      style={[styles.pageButton, disabled && styles.pageButtonOff]}
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={styles.pageButtonText}>{text}</Text>
    </Pressable>
  );
}

/**
 * 정렬 헤더 한 칸. 지금 정렬 열에는 ▼(많은순/가나다순) ▲(적은순/역순)를 붙인다.
 */
function SortHeader({
  text,
  sortKey,
  sort,
  onPress,
  style,
}: {
  text: string;
  sortKey: TitleSortKey;
  sort: TitleSort;
  onPress: (key: TitleSortKey) => void;
  style: object;
}) {
  const styles = useStyles(makeStyles);
  const active = sort.key === sortKey;
  return (
    <Pressable
      style={style}
      hitSlop={6}
      onPress={() => onPress(sortKey)}
      accessibilityRole="button"
      accessibilityLabel={`${text}으로 정렬`}
    >
      <Text style={[styles.headerText, sortKey !== 'name' && { textAlign: 'right' }, active && styles.headerTextOn]}>
        {text}
        {active ? (sort.desc ? ' ▼' : ' ▲') : ''}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    rowOpen: { backgroundColor: t.colors.surface },
    rowPressed: { backgroundColor: t.colors.surface },
    // 말풍선이 이웃 줄 위로 그려지도록 앞으로 올린다
    peekingRow: { zIndex: 10, elevation: 10 },
    bubble: {
      position: 'absolute',
      left: 12,
      right: 12,
      backgroundColor: t.colors.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      elevation: 6,
    },
    bubbleAbove: { bottom: '100%', marginBottom: 2 },
    bubbleBelow: { top: '100%', marginTop: 2 },
    bubbleText: { fontSize: 15, color: t.colors.bg },
    headerRow: { backgroundColor: t.colors.surface, paddingVertical: 8 },
    headerText: { fontSize: 13, color: t.colors.subText },
    headerTextOn: { color: t.colors.text, fontWeight: '700' },
    name: { flex: 1 },
    nameText: { fontSize: 15, color: t.colors.text },
    count: { width: 64 },
    amount: { width: 120 },
    countText: { textAlign: 'right', fontSize: 13, color: t.colors.subText },
    amountText: { textAlign: 'right', fontSize: 15, color: t.colors.text },
    expanded: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    more: { paddingVertical: 14, alignItems: 'center' },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 10,
    },
    pageButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: t.radius,
      backgroundColor: t.colors.surface,
    },
    pageButtonOff: { opacity: 0.35 },
    pageButtonText: { fontSize: 14, color: t.colors.text },
    pageText: {
      minWidth: 56,
      textAlign: 'center',
      fontSize: 14,
      color: t.colors.subText,
    },
    moreText: { fontSize: 14, color: t.colors.primary },
    empty: {
      textAlign: 'center',
      color: t.colors.subText,
      paddingVertical: 16,
    },
  });
