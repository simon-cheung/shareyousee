import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ContactRecord, ContactEndpoint, GroupRecord } from '@/types/contacts'
import type { DeviceLabel } from '@/types/wallet'
import { useUserStore } from './user'

/**
 * 联系人 + 群组仓库。
 * - 联系人以 walletId 聚合,endpoints 数组承载多端点
 * - 群组只引用 walletId,不嵌套
 * - 全部 localStorage 持久化
 */
export const useContactsStore = defineStore('contacts', () => {
  const selfWalletId = computed(() => useUserStore().walletInfo.walletId)

  const contacts = ref<ContactRecord[]>([])
  const groups = ref<GroupRecord[]>([])
  const selectedContactId = ref<string | null>(null)
  const selectedGroupId = ref<string | null>(null)
  const hasInitialized = ref(false)

  // ---------- 持久化 ----------

  function persistContacts() {
    localStorage.setItem('sy-contacts', JSON.stringify(contacts.value))
  }
  function persistGroups() {
    localStorage.setItem('sy-groups', JSON.stringify(groups.value))
  }

  // ---------- 计算属性 ----------

  const selfRecord = computed<ContactRecord | null>(() => {
    const id = selfWalletId.value
    if (!id) return null
    return contacts.value.find((c) => c.walletId === id) || null
  })

  const selfEndpoints = computed<ContactEndpoint[]>(() => {
    return selfRecord.value?.endpoints || []
  })

  const otherContacts = computed<ContactRecord[]>(() => {
    const id = selfWalletId.value
    return contacts.value.filter((c) => c.walletId !== id)
  })

  // 最近 5 个对端 walletId(去重,按 lastInteractionAt 倒序)
  const recentContactIds = computed<string[]>(() => {
    const id = selfWalletId.value
    return otherContacts.value
      .filter((c) => c.lastInteractionAt > 0)
      .sort((a, b) => b.lastInteractionAt - a.lastInteractionAt)
      .slice(0, 5)
      .map((c) => c.walletId)
  })

  const recentContacts = computed<ContactRecord[]>(() => {
    const id = selfWalletId.value
    return contacts.value
      .filter((c) => c.walletId !== id && c.lastInteractionAt > 0)
      .sort((a, b) => b.lastInteractionAt - a.lastInteractionAt)
      .slice(0, 5)
  })

  // ---------- 联系人操作 ----------

  // 写入/合并一个端点;若 walletId 不存在则新建 ContactRecord
  function upsertEndpoint(
    walletId: string,
    publicKey: string,
    deviceLabel: DeviceLabel,
    via: ContactEndpoint['lastSeenVia'] = 'transfer'
  ) {
    if (!walletId) return
    let rec = contacts.value.find((c) => c.walletId === walletId)
    if (!rec) {
      rec = {
        walletId,
        publicKey,
        endpoints: [],
        lastInteractionAt: 0
      }
      contacts.value.push(rec)
    } else if (!rec.publicKey && publicKey) {
      rec.publicKey = publicKey
    }
    const ep = rec.endpoints.find((e) => e.walletId === walletId && e.deviceLabel === deviceLabel)
    const now = Date.now()
    if (ep) {
      ep.lastSeenAt = now
      ep.lastSeenVia = via
      ep.publicKey = publicKey || ep.publicKey
    } else {
      rec.endpoints.push({
        walletId,
        publicKey,
        deviceLabel,
        lastSeenAt: now,
        lastSeenVia: via
      })
    }
    persistContacts()
  }

  // 标记一次交互(更新 lastInteractionAt)
  function markInteracted(walletId: string) {
    if (!walletId || walletId === selfWalletId.value) return
    const rec = contacts.value.find((c) => c.walletId === walletId)
    if (!rec) return
    rec.lastInteractionAt = Date.now()
    persistContacts()
  }

  function renameContact(walletId: string, alias: string) {
    const rec = contacts.value.find((c) => c.walletId === walletId)
    if (!rec) return
    rec.alias = alias.trim() || undefined
    persistContacts()
  }

  // 根据对端上报的 nickname 推断 alias:跳过系统自动生成的占位名
  function applyAliasFromNickname(walletId: string, nickname: string | undefined) {
    if (!walletId || !nickname) return
    // User_xxxxxx 是 userStore.setNickname('' ) 的兜底,不能作为别名
    if (/^User_[A-Za-z0-9]{4,}$/.test(nickname)) return
    const rec = contacts.value.find((c) => c.walletId === walletId)
    if (!rec) return
    // 已有手动 alias 不覆盖(用户主动起的名字优先)
    if (rec.alias && rec.alias.trim()) return
    rec.alias = nickname.trim()
    persistContacts()
  }

  function removeContact(walletId: string) {
    contacts.value = contacts.value.filter((c) => c.walletId !== walletId)
    // 同步清理群组成员关系
    for (const g of groups.value) {
      g.memberWalletIds = g.memberWalletIds.filter((id) => id !== walletId)
    }
    if (selectedContactId.value === walletId) selectedContactId.value = null
    persistContacts()
    persistGroups()
  }

  function selectContact(id: string | null) {
    selectedContactId.value = id
  }

  // ---------- 群组操作 ----------

  function createGroup(name: string): GroupRecord {
    const g: GroupRecord = {
      id: crypto.randomUUID(),
      name: name.trim() || 'Group',
      memberWalletIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    groups.value.push(g)
    persistGroups()
    return g
  }

  function renameGroup(id: string, name: string) {
    const g = groups.value.find((x) => x.id === id)
    if (!g) return
    g.name = name.trim() || g.name
    g.updatedAt = Date.now()
    persistGroups()
  }

  function removeGroup(id: string) {
    groups.value = groups.value.filter((g) => g.id !== id)
    if (selectedGroupId.value === id) selectedGroupId.value = null
    persistGroups()
  }

  // 联系人加入群组;群组不能加入群组
  function addContactToGroup(groupId: string, contactWalletId: string) {
    const g = groups.value.find((x) => x.id === groupId)
    if (!g) return
    if (!contacts.value.some((c) => c.walletId === contactWalletId)) return
    if (g.memberWalletIds.includes(contactWalletId)) return
    g.memberWalletIds.push(contactWalletId)
    g.updatedAt = Date.now()
    persistGroups()
  }

  function removeMemberFromGroup(groupId: string, contactWalletId: string) {
    const g = groups.value.find((x) => x.id === groupId)
    if (!g) return
    g.memberWalletIds = g.memberWalletIds.filter((id) => id !== contactWalletId)
    g.updatedAt = Date.now()
    persistGroups()
  }

  // 把一个群组解析为成员 walletId 列表(去重)
  function resolveGroupMembers(groupId: string): string[] {
    const g = groups.value.find((x) => x.id === groupId)
    if (!g) return []
    return [...new Set(g.memberWalletIds)]
  }

  // ---------- 初始化 ----------

  function initialize() {
    if (hasInitialized.value) return
    hasInitialized.value = true
    try {
      const c = localStorage.getItem('sy-contacts')
      if (c) contacts.value = JSON.parse(c)
      const g = localStorage.getItem('sy-groups')
      if (g) groups.value = JSON.parse(g)
    } catch (e) {
      console.warn('contacts parse failed', e)
    }
  }

  return {
    contacts,
    groups,
    selectedContactId,
    selectedGroupId,
    selfRecord,
    selfEndpoints,
    otherContacts,
    recentContactIds,
    recentContacts,
    hasInitialized,
    initialize,
    upsertEndpoint,
    markInteracted,
    renameContact,
    applyAliasFromNickname,
    removeContact,
    selectContact,
    createGroup,
    renameGroup,
    removeGroup,
    addContactToGroup,
    removeMemberFromGroup,
    resolveGroupMembers
  }
})
