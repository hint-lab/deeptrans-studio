import { prisma } from '@/lib/db'
import { currentUser } from '@/lib/auth'

export type TenantContext = {
  tenantId: string
  userId: string
  role: 'ADMIN' | 'USER' | 'MEMBER'
}

export async function requireTenantContext(tenantId: string): Promise<TenantContext> {
  const user = await currentUser()
  const userId = user?.id
  if (!userId) throw new Error('未登录')
  const boundTenantId = (user as any)?.tenantId as string | undefined
  if (!boundTenantId) throw new Error('用户未绑定租户')
  if (boundTenantId !== tenantId) throw new Error('无权限访问该租户')
  const role = ((user as any)?.role as any) || 'USER'
  return { tenantId, userId, role }
}

export async function assertTenantAdmin(tenantId: string) {
  const tc = await requireTenantContext(tenantId)
  if (tc.role !== 'ADMIN') throw new Error('需要租户管理员权限')
  return tc
}


