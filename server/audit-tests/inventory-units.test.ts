import {expect,test} from '@jest/globals'
import {convertQuantity,validatePackage} from '../src/utils/inventoryUnits'
test.each([[2,'kg','g',2000],[25,'g','kg',0.025],[2,'L','ml',2000],[25,'ml','L',0.025],[2,'kg','kg',2]])('explicit same-dimension conversion %s %s -> %s',(q,a,b,result)=>expect(convertQuantity(q as number,a as string,b as string)).toBe(result))
test.each([['kg','L'],['g','ml'],['bag','kg'],['pcs','kg']])('rejects ambiguous dimensions %s -> %s',(a,b)=>expect(()=>convertQuantity(1,a,b)).toThrow('INCOMPATIBLE_INVENTORY_UNITS'))
test('material-specific package factor is explicit and cannot redefine metric units',()=>{expect(convertQuantity(2,'bag','kg',{unit:'bag',quantity:2,baseUnit:'kg'})).toBe(4);expect(()=>validatePackage({unit:'L',quantity:1,baseUnit:'kg'},'kg')).toThrow();expect(()=>convertQuantity(1,'bag','g',{unit:'bag',quantity:2,baseUnit:'kg'})).toThrow()})
