import {useEmployeeNavigation} from '../../contexts/EmployeeAccess';
import {permissionForPage} from '../../../../shared/StaffAccess';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
export function InventoryIndexPage() {
    const allowed=useEmployeeNavigation();
    const visible=(entries:string[][])=>entries.filter(([,path])=>allowed(permissionForPage(path)||''));
    const { t } = useTranslation(), location = useLocation();
    const main = [['overview', '/inventory'], ['logs', '/inventory/logs'], ['countReview', '/inventory/count'], ['purchaseReceive', '/inventory/purchase-orders'], ['consumption', '/inventory/consumption'], ['alerts', '/inventory/alerts']];
    const more = [['inventoryFlow.forecast','/inventory/forecast'], ['inventoryFlow.physicalAnalysis', '/inventory/physical-analysis'], ['inventory.process', '/inventory/process'], ['inventory.restock', '/inventory/restock'], ['inventory.suppliers', '/inventory/suppliers'], ['inventoryFlow.settings', '/inventory/alert-config']];
    return <div className="flex flex-col h-full"><nav className="sticky top-0 bg-surface z-10 border-b mb-4 pb-3 space-y-2"><div className="flex flex-wrap gap-1 bg-white rounded-lg p-1">{visible(main).map(([key, path]) => <Link key={path} to={path} className={`px-4 py-2 rounded-md text-sm font-medium ${location.pathname === path ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{t(key==='alerts'?'inventoryAlerts.title':'inventoryFlow.' + key)}</Link>)}</div><details open={more.some(([, path]) => path === location.pathname)}><summary className="text-sm text-gray-500 cursor-pointer">{t('inventoryFlow.more')}</summary><div className="flex flex-wrap gap-3 pt-2">{visible(more).map(([key, path]) => <Link key={path} to={path} className={`text-sm ${location.pathname === path ? 'text-primary font-bold' : 'text-gray-500'}`}>{t(key)}</Link>)}</div></details></nav><div className="flex-1 overflow-auto"><Outlet /></div></div>;
}
