/**
 * 카테고리 선택 모달 (접고 펼치는 목록).
 * 대분류만 보이고, 오른쪽 화살표를 누르면 그 아래 소분류가 펼쳐진다. 이름을 누르면 그 카테고리를 고른다.
 * 맨 위에 추천 카테고리(★ 대분류 > 소분류)를 따로 보여줄 수 있다.
 */
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../db/queries';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

interface Props {
  visible: boolean;
  title: string;
  categories: Category[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
  /** 맨 위 "전체" 같은 선택 안 함 항목 이름 (없으면 안 보임) */
  allLabel?: string;
  /** 고를 수 없는 카테고리 (흐리게 표시) */
  disabledIds?: number[];
  /** 대분류 이름 아래 작은 설명 (예: 소분류 포함) */
  majorSub?: string;
  /** 맨 위 추천 카테고리 (sub = 설명 문구) */
  suggestions?: { id: number; sub: string }[];
}

/** 목록 한 줄 */
type Row =
  | { kind: 'suggest'; cat: Category; parent?: Category; sub: string }
  | { kind: 'all' } | { kind: 'major'; cat: Category; childCount: number } | { kind: 'minor'; cat: Category };

/**
 * 카테고리 선택 모달. 닫혀 있으면 그리지 않아서, 열 때마다 고른 카테고리의 대분류가 펼쳐진 상태로 시작한다.
 */
export function CategoryTreePicker(props: Props) {
  return props.visible ? <TreeDialog {...props} /> : null;
}

/**
 * 열린 상태의 모달.
 */
function TreeDialog({
  title,
  categories,
  selected,
  onSelect,
  onClose,
  allLabel,
  disabledIds = [],
  majorSub,
  suggestions = [],
}: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const selectedCat = categories.find((c) => c.id === selected);
  const [expanded, setExpanded] = useState<number[]>(selectedCat?.parent_id != null ? [selectedCat.parent_id] : []);

  const majors = categories.filter((c) => c.parent_id === null);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows: Row[] = [
    ...suggestions.flatMap((sg): Row[] => {
      const cat = byId.get(sg.id);
      if (!cat || disabledIds.includes(cat.id)) return [];
      return [{ kind: 'suggest', cat, parent: cat.parent_id !== null ? byId.get(cat.parent_id) : undefined, sub: sg.sub }];
    }),
    ...(allLabel ? [{ kind: 'all' } as const] : []),
    ...majors.flatMap((m) => {
      const children = categories.filter((c) => c.parent_id === m.id);
      const head: Row = { kind: 'major', cat: m, childCount: children.length };
      return expanded.includes(m.id) ? [head, ...children.map((cat): Row => ({ kind: 'minor', cat }))] : [head];
    }),
  ];

  /** 고르고 닫는다. */
  const pick = (id: number | null): void => {
    onSelect(id);
    onClose();
  };

  /** 대분류 펼치기/접기 */
  const toggle = (id: number): void =>
    setExpanded((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <FlatList
            data={rows}
            keyExtractor={(r) => (r.kind === 'all' ? 'all' : `${r.kind}-${r.cat.id}`)}
            renderItem={({ item: r }) => {
              if (r.kind === 'suggest') {
                return (
                  <Pressable style={[styles.row, styles.suggestRow]} onPress={() => pick(r.cat.id)}>
                    <Text style={styles.name}>
                      ★ {r.parent ? `${r.parent.name} > ` : ''}
                      {r.cat.name}
                    </Text>
                    <Text style={styles.sub}>{r.sub}</Text>
                  </Pressable>
                );
              }
              if (r.kind === 'all') {
                return (
                  <Pressable style={[styles.row, selected === null && styles.selected]} onPress={() => pick(null)}>
                    <Text style={styles.name}>{allLabel}</Text>
                  </Pressable>
                );
              }
              const disabled = disabledIds.includes(r.cat.id);
              const isSelected = selected === r.cat.id;
              if (r.kind === 'minor') {
                return (
                  <Pressable
                    style={[styles.row, styles.minorRow, isSelected && styles.selected]}
                    onPress={() => pick(r.cat.id)}
                    disabled={disabled}
                  >
                    <Text style={[styles.minorName, disabled && styles.disabled]}>└ {r.cat.name}</Text>
                  </Pressable>
                );
              }
              const open = expanded.includes(r.cat.id);
              return (
                <View style={[styles.majorRow, isSelected && styles.selected]}>
                  <Pressable style={styles.majorName} onPress={() => pick(r.cat.id)} disabled={disabled}>
                    <Text style={[styles.name, disabled && styles.disabled]}>{r.cat.name}</Text>
                    {majorSub && !disabled && r.childCount > 0 ? <Text style={styles.sub}>{majorSub}</Text> : null}
                  </Pressable>
                  {r.childCount > 0 ? (
                    <Pressable
                      style={styles.arrow}
                      hitSlop={6}
                      onPress={() => toggle(r.cat.id)}
                      accessibilityLabel={`${r.cat.name} 소분류 ${open ? '접기' : '펼치기'}`}
                      accessibilityState={{ expanded: open }}
                    >
                      <Text style={[styles.arrowText, { color: open ? theme.colors.primary : theme.colors.subText }]}>
                        {open ? '▾' : '▸'} {r.childCount}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
    dialog: { backgroundColor: t.colors.bg, borderRadius: t.radius, maxHeight: '80%', overflow: 'hidden' },
    dialogTitle: { backgroundColor: t.colors.header, color: t.colors.headerText, fontSize: 18, fontWeight: '700', padding: 16 },
    row: { paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    majorRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    majorName: { flex: 1, paddingVertical: 14, paddingLeft: 18 },
    // 화살표 칸은 손가락으로 누르기 쉽게 넓게
    arrow: { width: 64, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    arrowText: { fontSize: 15, fontWeight: '600' },
    suggestRow: { backgroundColor: t.colors.surface },
    minorRow: { paddingLeft: 34, backgroundColor: t.colors.surface },
    selected: { backgroundColor: t.colors.tagBg },
    name: { fontSize: 16, color: t.colors.text },
    minorName: { fontSize: 15, color: t.colors.text },
    sub: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    disabled: { color: t.colors.muted },
  });
