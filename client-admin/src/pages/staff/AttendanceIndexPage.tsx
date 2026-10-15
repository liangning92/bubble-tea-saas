import {useEmployeeNavigation} from '../../contexts/EmployeeAccess'
import {permissionForPage} from '../../../../shared/StaffAccess'
import {attendanceNavigationLabels} from '../../../../shared/attendanceNavigationLabels'
import {useTranslation} from 'react-i18next'
import {Outlet,Link,useLocation} from 'react-router-dom'

export function AttendanceIndexPage(){
 const {i18n}=useTranslation(),c=attendanceNavigationLabels(i18n.language),allowed=useEmployeeNavigation(),location=useLocation()
 const base='/staff/attendance'
 const groups=[
  {key:'records',label:c.records,hint:c.recordHint,items:[{label:c.attendance,path:base+'/dashboard'},{label:c.balance,path:base+'/leave/balance'}]},
  {key:'approvals',label:c.approvals,hint:c.approvalHint,items:[{label:c.leave,path:base+'/leave'},{label:c.swap,path:base+'/shift-swap'},{label:c.overtime,path:base+'/overtime'},{label:c.correction,path:base+'/correction'},{label:c.review,path:base+'/workspace'}]},
  {key:'settings',label:c.settings,hint:c.settingsHint,items:[{label:c.rules,path:base+'/rules'},{label:c.late,path:base+'/late-rules'},{label:i18n.language.startsWith('zh')?'请假类型':i18n.language.startsWith('id')?'Jenis cuti':'Leave types',path:base+'/leave/types'}]},
 ].map(group=>({...group,items:group.items.filter(item=>allowed(item.path.endsWith('/late-rules')?'owner.only':permissionForPage(item.path)))})).filter(group=>group.items.length)
 const match=groups.flatMap(group=>group.items.map(item=>({group,item}))).sort((a,b)=>b.item.path.length-a.item.path.length).find(({item})=>location.pathname===item.path||location.pathname.startsWith(item.path+'/'))
 const active=match?.group||groups[0]
 return <div className="flex flex-col min-h-0">
  <nav aria-label={c.navigation} className="mb-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 space-y-3">
   <div className="flex flex-wrap gap-2">{groups.map(group=><Link key={group.key} to={group.items[0].path} aria-current={group.key===active?.key?'true':undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${group.key===active?.key?'bg-primary text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{group.label}</Link>)}</div>
   {active&&<><p className="text-sm text-gray-500">{active.hint}</p><div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">{active.items.map(item=><Link key={item.path} to={item.path} aria-current={item.path===match?.item.path||(!match&&item===active.items[0])?'page':undefined} className={`rounded-lg px-3 py-2 text-sm ${item.path===match?.item.path||(!match&&item===active.items[0])?'bg-primary/10 text-primary font-semibold':'text-gray-600 hover:bg-gray-50'}`}>{item.label}</Link>)}</div></>}
  </nav>
  <div className="flex-1 min-w-0"><Outlet/></div>
 </div>
}
