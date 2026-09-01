import { useState } from '@/utils/useState'

export default function useFullScreenLoader(isLoading?: boolean) {
  const isFullScreenLoading = useState('isFullScreenLoading', () => true)
  if (isLoading !== undefined) {
    isFullScreenLoading.value = isLoading
  }
  return isFullScreenLoading
}
