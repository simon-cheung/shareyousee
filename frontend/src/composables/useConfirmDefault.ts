import { useState } from '@/utils/useState'

export default function useConfirmDefault() {
  return useState('isConfirmDefault', () => false)
}
