/**
 * 날짜 이모지 목록 다루기 (화면과 무관한 순수 함수).
 * DB(day_marks.emoji)에는 이모지를 공백으로 이어 붙여 저장한다. 예: "🍿 🍚"
 * 예전 값처럼 공백 없이 붙어 있으면("🍿🍚") 이모지 단위로 쪼갠다.
 */

/** 하루에 붙일 수 있는 이모지 최대 개수 */
export const MAX_MARKS = 3;

/** 이모지 한 글자(피부색·ZWJ 조합·국기 포함)를 찾는 정규식. 지원 안 되는 엔진이면 null. */
const EMOJI_RE: RegExp | null = (() => {
  try {
    return new RegExp(
      '\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?(?:\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?(?:\\p{Emoji_Modifier})?)*',
      'gu',
    );
  } catch {
    return null;
  }
})();

/**
 * 공백 없이 붙은 문자열을 이모지 단위로 나눈다. 이모지가 아닌 글자가 섞여 있으면 통째로 하나로 본다.
 * @param token 공백 없는 조각
 */
function splitToken(token: string): string[] {
  if (!EMOJI_RE) return [token];
  const found = token.match(EMOJI_RE);
  if (!found || found.join('') !== token) return [token];
  return found;
}

/**
 * 저장된 값을 이모지 목록으로 바꾼다. 중복은 하나만 남긴다.
 * @param value day_marks.emoji 값
 */
export function parseMarks(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const token of value.split(/\s+/)) {
    if (!token) continue;
    for (const e of splitToken(token)) if (!out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * 이모지 목록을 저장할 값으로 바꾼다. 비어 있으면 null (지우기).
 * @param list 이모지 목록
 */
export function joinMarks(list: readonly string[]): string | null {
  return list.length ? list.join(' ') : null;
}

/**
 * 이모지를 넣거나 뺀다. 이미 있으면 빼고, 없으면 끝에 넣는다 (최대 개수가 차 있으면 그대로).
 * @param list 현재 목록
 * @param emoji 누른 이모지
 * @param max 최대 개수
 */
export function toggleMark(list: readonly string[], emoji: string, max = MAX_MARKS): string[] {
  if (list.includes(emoji)) return list.filter((e) => e !== emoji);
  if (list.length >= max) return [...list];
  return [...list, emoji];
}

/**
 * 직접 입력한 이모지들을 목록에 더한다 (이미 있는 건 건너뛰고, 최대 개수까지만).
 * @param list 현재 목록
 * @param input 입력 문자열
 * @param max 최대 개수
 */
export function addMarks(list: readonly string[], input: string, max = MAX_MARKS): string[] {
  const out = [...list];
  for (const e of parseMarks(input)) {
    if (out.length >= max) break;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}
