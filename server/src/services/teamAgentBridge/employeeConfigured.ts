import {createNativeStoreAgent} from '../NativeStoreAgent'
import {nativeHermesConfig} from '../HermesNativeConfig'
const cache=new WeakMap<object,ReturnType<typeof createNativeStoreAgent>>()
/** One native Hermes deployment. No fallback, expiring task grant or mirrored tool list. */
export function configuredEmployeeDeployment(db:any){
 const cfg=nativeHermesConfig();if(!cfg)return undefined
 const existing=cache.get(db);if(existing)return existing
 const deployment=createNativeStoreAgent(db,cfg);cache.set(db,deployment);return deployment
}
