<script setup lang="ts">
import type { TableColumn } from '~/components/ui/Table.vue'
import type { MenuItem } from '~/components/ui/Menu.vue'
import { USER_ROLES, canAssignRole, type UserRole } from '#shared/utils/roles'

definePageMeta({ layout: 'settings', middleware: 'admin-auth' })
useSeoMeta({ title: 'Users & roles · Settings' })

const toast = useToast()
const copy = useClipboard()
const { admin, can } = useAdmin()

interface UserRow {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: UserRole
  lastLoginAt: string | null
  createdAt: string
  [key: string]: unknown
}
interface InviteRow {
  id: string
  email: string
  role: UserRole
  expiresAt: string
  expired: boolean
  [key: string]: unknown
}

const { data: users, refresh: refreshUsers, pending } = await useFetch<{ data: UserRow[]; count: number }>('/api/admin/users', {
  query: { limit: 200 },
  server: false,
  default: () => ({ data: [], count: 0 }),
})
const { data: invites, refresh: refreshInvites } = await useFetch<{ data: InviteRow[] }>('/api/admin/invites', {
  server: false,
  immediate: can('admin'),
  default: () => ({ data: [] }),
})

const userColumns: TableColumn[] = [
  { key: 'name', label: 'User' },
  { key: 'role', label: 'Role', width: '180px' },
  { key: 'lastLoginAt', label: 'Last sign-in' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]
const inviteColumns: TableColumn[] = [
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'expiresAt', label: 'Expires' },
  { key: 'actions', label: '', align: 'right', width: '56px' },
]

const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1)
const assignableRoles = computed(() => USER_ROLES.filter((r) => admin.value && canAssignRole(admin.value.role, r)).map((r) => ({ value: r, label: roleLabel(r) })))
const canEdit = (u: UserRow) => Boolean(admin.value && u.id !== admin.value.id && canAssignRole(admin.value.role, u.role))
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never')

async function changeRole(u: UserRow, role: string | null | undefined) {
  if (!role || role === u.role) return
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } })
    toast.success(`${u.email} is now ${roleLabel(role)}`)
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
  await refreshUsers()
}

const removeTarget = ref<UserRow | null>(null)
const removeOpen = computed({ get: () => Boolean(removeTarget.value), set: (v) => !v && (removeTarget.value = null) })
async function removeUser() {
  const u = removeTarget.value
  if (!u) return
  try {
    await $fetch(`/api/admin/users/${u.id}` as string, { method: 'DELETE' })
    toast.success(`Removed ${u.email}`)
    removeTarget.value = null
    await refreshUsers()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
const userMenu: MenuItem[] = [{ label: 'Remove user', value: 'remove', danger: true }]

// Invite flow
const inviteOpen = ref(false)
const inviteForm = reactive<{ email: string; role: UserRole }>({ email: '', role: 'member' })
const inviteErrors = ref<Record<string, string>>({})
const inviteUrl = ref('')
const inviting = ref(false)
function openInvite() {
  inviteForm.email = ''
  inviteForm.role = 'member'
  inviteErrors.value = {}
  inviteUrl.value = ''
  inviteOpen.value = true
}
async function sendInvite() {
  inviting.value = true
  inviteErrors.value = {}
  try {
    const res = await $fetch<{ url: string }>('/api/admin/invites', { method: 'POST', body: inviteForm })
    inviteUrl.value = res.url
    await refreshInvites()
  } catch (err) {
    inviteErrors.value = { email: apiErrorMessage(err), ...apiFieldErrors(err) }
  } finally {
    inviting.value = false
  }
}
async function revokeInvite(id: string) {
  try {
    await $fetch(`/api/admin/invites/${id}`, { method: 'DELETE' })
    toast.success('Invite revoked')
    await refreshInvites()
  } catch (err) {
    toast.error(apiErrorMessage(err))
  }
}
</script>

<template>
  <div class="page-stack">
    <AdminPageHeader
      :crumbs="[{ label: 'Settings', to: '/admin/settings' }, { label: 'Users & roles' }]"
      title="Users & roles"
      subtitle="Owners manage everything. Admins manage the store and team members. Members can work orders and the catalog but can't manage users or API keys."
      :search="false"
    >
      <template #actions>
        <UiButton v-if="can('admin')" variant="primary" @click="openInvite">Invite user</UiButton>
      </template>
    </AdminPageHeader>

    <UiCard flush title="Team">
      <UiTable :columns="userColumns" :rows="users.data" row-key="id" :loading="pending" caption="Team members">
        <template #cell-name="{ row }">
          <div class="row" style="--row-gap: 10px; flex-wrap: nowrap">
            <UiAvatar :name="[row.firstName, row.lastName].filter(Boolean).join(' ') || row.email" :size="28" />
            <div>
              <div>{{ [row.firstName, row.lastName].filter(Boolean).join(' ') || '—' }}<span v-if="row.id === admin?.id" class="meta"> · You</span></div>
              <div class="meta">{{ row.email }}</div>
            </div>
          </div>
        </template>
        <template #cell-role="{ row }">
          <UiSelect
            v-if="canEdit(row)"
            :model-value="row.role"
            :options="assignableRoles"
            :label="`Role for ${row.email}`"
            hide-label
            pill
            @update:model-value="changeRole(row, $event)"
          />
          <UiBadge v-else>{{ roleLabel(row.role) }}</UiBadge>
        </template>
        <template #cell-lastLoginAt="{ row }">
          <span class="meta">{{ fmtDate(row.lastLoginAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <UiMenu v-if="canEdit(row)" :items="userMenu" :label="`Actions for ${row.email}`" align="right" @select="removeTarget = row" />
        </template>
      </UiTable>
    </UiCard>

    <UiCard v-if="can('admin')" flush title="Pending invites">
      <UiTable v-if="invites.data.length" :columns="inviteColumns" :rows="invites.data" row-key="id" caption="Pending invites">
        <template #cell-email="{ row }"><span class="mono">{{ row.email }}</span></template>
        <template #cell-role="{ row }"><UiBadge>{{ roleLabel(row.role) }}</UiBadge></template>
        <template #cell-expiresAt="{ row }">
          <UiStatusBadge v-if="row.expired" status="expired" />
          <span v-else class="meta">{{ fmtDate(row.expiresAt) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <UiMenu :items="[{ label: 'Revoke invite', value: 'revoke', danger: true }]" :label="`Actions for invite ${row.email}`" align="right" @select="revokeInvite(row.id)" />
        </template>
      </UiTable>
      <UiEmptyState v-else title="No pending invites" description="Invites you send appear here until they're accepted." />
    </UiCard>

    <UiDialog v-model:open="inviteOpen" title="Invite a team member" description="They'll set their own password when they accept.">
      <form v-if="!inviteUrl" id="invite-form" class="stack" style="--stack-gap: 14px" @submit.prevent="sendInvite">
        <UiInput v-model="inviteForm.email" label="Email" type="email" required :error="inviteErrors.email" />
        <UiSelect v-model="inviteForm.role" label="Role" :options="assignableRoles" />
      </form>
      <div v-else class="stack" style="--stack-gap: 10px">
        <p>Invite created. Share this link with <span class="mono">{{ inviteForm.email }}</span>. It expires in 7 days and is shown only once.</p>
        <UiInput :model-value="inviteUrl" label="Invite link" mono readonly />
      </div>
      <template #footer>
        <template v-if="!inviteUrl">
          <UiButton @click="inviteOpen = false">Cancel</UiButton>
          <UiButton variant="primary" type="submit" form="invite-form" :loading="inviting">Send invite</UiButton>
        </template>
        <template v-else>
          <UiButton @click="copy(inviteUrl, 'Invite link copied')">Copy link</UiButton>
          <UiButton variant="primary" @click="inviteOpen = false">Done</UiButton>
        </template>
      </template>
    </UiDialog>

    <UiDialog v-model:open="removeOpen" title="Remove user" :description="`${removeTarget?.email} will lose access immediately.`">
      <template #footer>
        <UiButton @click="removeTarget = null">Cancel</UiButton>
        <UiButton variant="danger" @click="removeUser">Remove</UiButton>
      </template>
    </UiDialog>
  </div>
</template>
