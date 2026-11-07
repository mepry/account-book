/**
 * 카테고리 도넛 차트. 조각마다 바깥에 "이름 xx%" 캡션을 달고, 캡션이나 조각을 누르면 onPressItem,
 * 가운데 총 합계를 누르면 onPressTotal.
 * 0원 카테고리도 0% 캡션으로 보여준다.
 * 지시선과 조각 위치가 정확히 맞도록 react-native-svg로 직접 그린다.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { formatNumber } from '../lib/money';
import { hitTestPie, layoutPieLabels, toSlices } from '../lib/pieLabels';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

export interface PieItem {
  key: string;
  name: string;
  value: number;
  color: string;
}

interface Props {
  items: PieItem[];
  /** 차트 영역 너비 */
  width: number;
  onPressItem: (index: number) => void;
  /** 가운데 총 합계를 눌렀을 때 */
  onPressTotal: () => void;
}

/** 캡션 한 칸 높이 (테두리 상자 + 위아래 간격) */
const LABEL_HEIGHT = 42;
/** 캡션 테두리 상자 높이 (이름 + 퍼센트 두 줄) */
const BOX_HEIGHT = 36;
/** 차트와 캡션 사이 간격 */
const LABEL_GAP = 18;
/** 위아래 여백 */
const PAD_Y = 8;

/**
 * 캡션 달린 도넛 차트.
 */
export function CategoryPie({ items, width, onPressItem, onPressTotal }: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const radius = Math.min(105, width * 0.25);
  const thickness = radius * 0.42;
  const ringRadius = radius - thickness / 2;
  const circumference = 2 * Math.PI * ringRadius;
  // 가운데 빈 원 반지름 (총 합계 글자가 들어갈 자리)
  const hole = radius - thickness;

  const slices = toSlices(items.map((i) => i.value));
  const labels = layoutPieLabels(slices, radius, LABEL_HEIGHT);
  const total = items.reduce((s, i) => s + i.value, 0);
  const visible = slices.filter((s) => s.fraction > 0).length;

  // 캡션이 차트보다 위아래로 길어지면 그만큼 영역을 늘린다
  const top = Math.min(-radius, ...labels.map((l) => l.y - LABEL_HEIGHT / 2)) - PAD_Y;
  const bottom = Math.max(radius, ...labels.map((l) => l.y + LABEL_HEIGHT / 2)) + PAD_Y;
  const height = bottom - top;
  const cx = width / 2;
  const cy = -top;
  const labelWidth = Math.max(40, cx - radius - LABEL_GAP);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* 12시 방향에서 시작하도록 -90도 돌린다 */}
        <G transform={`rotate(-90 ${cx} ${cy})`}>
          {/* 바탕 링 (합계가 0이어도 차트 모양이 보이게) */}
          <Circle cx={cx} cy={cy} r={ringRadius} fill="none" stroke={theme.colors.surface} strokeWidth={thickness} />
          {slices.map((s, i) =>
            s.fraction > 0 ? (
              <Circle
                key={items[i].key}
                cx={cx}
                cy={cy}
                r={ringRadius}
                fill="none"
                stroke={items[i].color}
                strokeWidth={thickness}
                // 조각이 여러 개면 사이에 살짝 틈을 둔다
                strokeDasharray={`${Math.max(0, s.fraction * circumference - (visible > 1 ? 1.5 : 0))} ${circumference}`}
                strokeDashoffset={-s.start * circumference}
              />
            ) : null,
          )}
        </G>
        {labels.map((l, i) => (
          <Line
            key={`line-${items[i].key}`}
            x1={cx + l.anchorX}
            y1={cy + l.anchorY}
            x2={l.side === 'right' ? cx + radius + LABEL_GAP - 4 : cx - radius - LABEL_GAP + 4}
            // 상자 테두리에 닿게 한다
            y2={cy + l.y}
            stroke={theme.colors.border}
            strokeWidth={1}
          />
        ))}
      </Svg>

      {/* 가운데 총 합계 */}
      <View pointerEvents="none" style={[styles.center, { left: cx - hole, top: cy - hole, width: hole * 2, height: hole * 2 }]}>
        <Text style={styles.centerLabel}>총 합계</Text>
        <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
          ₩{formatNumber(total)}
        </Text>
      </View>

      {/* SVG 원은 테두리만 그려도 원 전체가 눌려서(맨 위 조각만 잡힘), 누른 위치의 각도로 조각을 찾는다 */}
      <Pressable
        style={{ position: 'absolute', left: cx - radius, top: cy - radius, width: radius * 2, height: radius * 2 }}
        onPress={(e) => {
          const hit = hitTestPie(slices, e.nativeEvent.locationX - radius, e.nativeEvent.locationY - radius, hole, radius);
          if (hit === 'center') onPressTotal();
          else if (hit !== null) onPressItem(hit);
        }}
        accessibilityLabel={`총 합계 ₩${formatNumber(total)} 전체 내역 보기`}
      />

      {labels.map((l, i) => {
        const item = items[i];
        const right = l.side === 'right';
        return (
          // 바깥 칸은 위치만 잡고, 누르는 영역은 테두리 상자 그대로 (상자를 보고 누를 수 있게)
          <View
            key={`label-${item.key}`}
            pointerEvents="box-none"
            style={[
              styles.label,
              {
                top: cy + l.y - BOX_HEIGHT / 2,
                width: labelWidth,
                alignItems: right ? 'flex-start' : 'flex-end',
              },
              right ? { left: cx + radius + LABEL_GAP - 4 } : { left: cx - radius - LABEL_GAP + 4 - labelWidth },
            ]}
          >
            <Pressable
              style={({ pressed }) => [styles.box, { borderColor: item.color }, pressed && styles.boxPressed]}
              android_ripple={{ color: theme.colors.border, borderless: false, foreground: true }}
              onPress={() => onPressItem(i)}
              accessibilityLabel={`${item.name} ${slices[i].percent}% 상세 보기`}
            >
              <View style={[styles.nameRow, !right && { flexDirection: 'row-reverse' }]}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text style={[styles.name, item.value === 0 && styles.zero]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              <Text style={[styles.percent, { textAlign: right ? 'left' : 'right' }, item.value === 0 && styles.zero]}>
                {slices[i].percent}%
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    centerLabel: { fontSize: 12, color: t.colors.subText },
    centerValue: { fontSize: 15, fontWeight: '700', color: t.colors.text },
    label: { position: 'absolute', height: BOX_HEIGHT, justifyContent: 'center' },
    box: {
      height: BOX_HEIGHT,
      maxWidth: '100%',
      justifyContent: 'center',
      paddingHorizontal: 6,
      borderWidth: 1,
      borderRadius: 6,
      backgroundColor: t.colors.bg,
      overflow: 'hidden',
    },
    boxPressed: { backgroundColor: t.colors.surface },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    name: { fontSize: 11, lineHeight: 14, color: t.colors.text, flexShrink: 1 },
    percent: { fontSize: 12, lineHeight: 15, fontWeight: '700', color: t.colors.text },
    zero: { color: t.colors.muted },
  });
