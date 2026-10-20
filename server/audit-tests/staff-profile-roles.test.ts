import { expect, jest, test } from '@jest/globals'
import { staffProfileRoles } from '../src/services/StaffProfileRoleService'
import { defaultRolesV2 } from '../src/services/StaffPermissionV2Core'
import { staffProfileRoleLabel } from '../../shared/staffProfileRole'
const employee = { id: 'employee', storeId: 'one', user: { role: 'cashier' } }
function database(policy: any, legacy?: any) {
  return { config: { findUnique: jest.fn<any>(async ({where}: any) => {
    expect(where.storeId_key.storeId).toBe('one')
    const value = where.storeId_key.key === 'staff.access.policy.v2' ? policy : legacy
    return value ? {value: JSON.stringify(value)} : null
  }) } }
}
test('all effective role IDs use active bindings and the same Chinese and Indonesian labels', async () => {
  const chinese = ['店长','收银员','制作员','库管员','财务员','普通员工']
  const indonesian = ['Manajer toko','Kasir','Produksi','Petugas stok','Akuntan','Karyawan']
  for (const [index, role] of defaultRolesV2.entries()) {
    const d = database({version:2,active:true,revision:4,roles:defaultRolesV2,assignments:[{staffId:'employee',roleId:role.id,overrides:{}}]})
    const result = await staffProfileRoles(employee, d)
    expect(result.accessRole?.id).toBe(role.id)
    expect(result.accessRoles.map(r=>r.id)).toEqual(['',...defaultRolesV2.map(r=>r.id)])
    expect(staffProfileRoleLabel({...employee,...result},'zh','管理员')).toBe(chinese[index])
    expect(staffProfileRoleLabel({...employee,...result},'id','Administrator')).toBe(indonesian[index])
  }
})
test('draft policies and job titles cannot replace active bindings; no assignment uses effective basic', async () => {
  const result = await staffProfileRoles(employee,database({version:2,active:true,revision:4,roles:defaultRolesV2,assignments:[]}))
  expect(result.accessRole?.id).toBe('basic')
  expect(staffProfileRoleLabel({...employee,...result},'zh','管理员')).toBe('普通员工')
})
test('custom IDs and renamed presets keep exact names, without guessing by name', async () => {
  const custom = {...defaultRolesV2[0],id:'custom',name:'Custom role'}
  const result = await staffProfileRoles(employee,database({version:2,active:true,revision:4,roles:[...defaultRolesV2,custom],assignments:[{staffId:'employee',roleId:'custom',overrides:{}}]}))
  expect(staffProfileRoleLabel({...employee,...result},'id','Admin')).toBe('Custom role')
  expect(staffProfileRoleLabel({role:'staff',accessRole:{id:'cashier',name:'Senior cashier'}},'zh','管理员')).toBe('Senior cashier')
})
test('inactive V2 preserves legacy binding and unbound account role; admin bypasses policy', async () => {
  const role = {id:'12345678-1234-4234-8234-123456789012',name:'Legacy cashier',description:'',baseRole:'cashier',permissions:[]}
  const d = database(null,{revision:2,roles:[role],assignments:[{staffId:'employee',roleId:role.id,originalRole:'staff'}]})
  expect((await staffProfileRoles(employee,d)).accessRole?.name).toBe(role.name)
  const empty = database(null)
  const result = await staffProfileRoles(employee,empty)
  expect(staffProfileRoleLabel({...employee,...result},'zh','管理员')).toBe('收银员')
  expect(await staffProfileRoles({...employee,user:{role:'admin'}},d)).toEqual({accessRole:null,accessRoles:[],accessRoleSelection:'__account__'})
  expect(staffProfileRoleLabel({role:'admin',accessRole:{id:'cashier',name:'收银员'}},'zh','管理员')).toBe('管理员')
})
test('policies are scoped to the employee store and never written', async () => {
  const d = database({version:2,active:true,revision:1,roles:defaultRolesV2,assignments:[{staffId:'other-store-employee',roleId:'manager',overrides:{}}]})
  expect((await staffProfileRoles(employee,d)).accessRole?.id).toBe('basic')
  expect(Object.keys(d.config)).toEqual(['findUnique'])
})

test('unassigned fallback and explicit renamed basic retain distinct selection IDs', async () => {
  const roles = defaultRolesV2.map(r=>r.id==='basic'?{...r,name:'Custom basic'}:r)
  for (const assigned of [false,true]) {
    const result = await staffProfileRoles(employee,database({version:2,active:true,revision:2,roles,assignments:assigned?[{staffId:'employee',roleId:'basic',overrides:{}}]:[]}))
    expect(result.accessRoleSelection).toBe(assigned?'basic':'')
    expect(result.accessRole?.name).toBe(assigned?'Custom basic':'普通员工')
    expect(result.accessRoles.find(r=>r.id===result.accessRoleSelection)?.name).toBe(result.accessRole?.name)
  }
})

test('inactive V2 ignores its proposed assignments and preserves legacy authorization', async () => {
  const inactive = {version:2,active:false,revision:8,roles:defaultRolesV2,assignments:[{staffId:'employee',roleId:'manager',overrides:{}}]}
  const result = await staffProfileRoles(employee,database(inactive))
  expect(result.accessRole).toBeNull()
  expect(staffProfileRoleLabel({...employee,...result},'id','Admin')).toBe('Kasir')
})
test('saved draft is never read by the profile projection', async () => {
  const d = database({version:2,active:true,revision:8,roles:defaultRolesV2,assignments:[{staffId:'employee',roleId:'cashier',overrides:{}}]})
  const result = await staffProfileRoles(employee,d)
  expect(result.accessRole?.id).toBe('cashier')
  expect(d.config.findUnique.mock.calls.map((call:any)=>call[0].where.storeId_key.key)).toEqual(['staff.access.policy.v2'])
})
