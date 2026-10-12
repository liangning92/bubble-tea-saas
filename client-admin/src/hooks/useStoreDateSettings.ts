import {useMemo,useEffect} from 'react'
import {useQuery} from '@tanstack/react-query'
import {configApi} from '../services/api'
import {useAuthStore} from '../stores/auth'
import {configureStoreDates,resolveDateSettings} from '../utils/storeDateTime'
export function useStoreDateSettings(){
 const storeId=useAuthStore(s=>s.user?.storeId)
 const query=useQuery({queryKey:['config','store',storeId||''],queryFn:()=>configApi.get(storeId!),enabled:!!storeId})
 const settings=useMemo(()=>resolveDateSettings(query.data?.data?.data?.storeInfo),[query.data])
 useEffect(()=>configureStoreDates(settings),[settings])
 return settings
}
