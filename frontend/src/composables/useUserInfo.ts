import { useState } from '@/utils/useState'

export default function useUserInfo() {
  return useState('userInfo', () => ({
    nickname: '',
    avatarURL: ''
  }))
}
