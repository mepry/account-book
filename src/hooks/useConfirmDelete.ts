/**
 * 목록에서 항목을 길게 눌렀을 때 쓰는 "삭제 확인 → 삭제" 동작 (달력 내역·통계·검색 공용).
 */
import { Alert } from 'react-native';
import { deleteTransaction } from '../db/queries';
import { bumpDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { useDb } from './useDb';

/**
 * 삭제 확인 창을 띄우고, 삭제를 누르면 거래를 지우는 함수를 돌려준다.
 * @returns (editId, installment) => void — installment면 할부 전체(모든 회차)가 지워진다고 알린다
 */
export function useConfirmDelete(): (editId: number, installment: boolean) => void {
  const db = useDb();
  return (editId, installment) => {
    Alert.alert('삭제', installment ? '할부 전체(모든 회차)가 삭제됩니다.' : '이 내역을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(db, editId)
            .then(bumpDataVersion)
            .catch((e) => log.error('삭제 실패', e));
        },
      },
    ]);
  };
}
