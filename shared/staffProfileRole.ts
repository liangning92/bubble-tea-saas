import { staffAccessLabels, staffRoleLabel } from './staffAccessLabels'

export function staffProfileRoleLabel(staff: { role?: string; user?: { role: string }; accessRole?: { id: string; name: string } | null }, language: string, adminLabel: string) {
  const labels = staffAccessLabels(language)
  const role = staff.role || staff.user?.role
  if (role === 'admin') return adminLabel
  if (staff.accessRole) return staffRoleLabel(staff.accessRole.id, staff.accessRole.name, labels)
  return role === 'manager' ? labels.manager : role === 'cashier' ? labels.cashier : labels.basic
}

export function staffProfileRoleText(language: string) {
  return language.startsWith('zh') ? {
    hint: '实际岗位来自已生效的员工权限。更改岗位请前往员工权限，保存档案不会更改权限。',
    historical: '历史职位（仅作资料）'
  } : language.startsWith('id') ? {
    hint: 'Jabatan mengikuti izin karyawan yang aktif. Ubah jabatan di Izin karyawan; menyimpan profil tidak mengubah izin.',
    historical: 'Jabatan lama (informasi saja)'
  } : {
    hint: 'Roles follow active employee permissions. Change roles in Employee permissions; saving this profile does not change access.',
    historical: 'Historical job title (reference only)'
  }
}
