import {beforeEach,expect,jest,test} from '@jest/globals'
jest.mock('../src/config/database',()=>({__esModule:true,default:{stockOutLog:{findMany:jest.fn(async()=>[])},order:{findMany:jest.fn()},expense:{findMany:jest.fn()},salary:{findMany:jest.fn()},config:{findUnique:jest.fn()},bankAccount:{findMany:jest.fn()},inventory:{findMany:jest.fn()},purchaseOrder:{aggregate:jest.fn()},stockInLog:{aggregate:jest.fn()}}}))
jest.mock('../src/services/FixedAssetService',()=>({getDepreciationSchedule:jest.fn(async()=>[])}))
import prisma from '../src/config/database'
import {getProfitAnalysis,getCashFlow,getBalanceSheet} from '../src/services/FinanceService'
const db=prisma as any,from=new Date('2026-10-01T00:00:00+07:00'),to=new Date('2026-10-31T23:59:59+07:00')
const payment={amount:16000000,category:'supplies',type:'supplies',referenceType:'purchase'}
beforeEach(()=>{jest.clearAllMocks();db.order.findMany.mockResolvedValue([]);db.expense.findMany.mockResolvedValue([payment]);db.salary.findMany.mockResolvedValue([]);db.config.findUnique.mockResolvedValue(null);db.bankAccount.findMany.mockResolvedValue([]);db.inventory.findMany.mockResolvedValue([]);db.purchaseOrder.aggregate.mockResolvedValue({_sum:{totalAmount:0}})})
test('actual procurement appears in purchase cash flow before receipt and never twice in operating costs',async()=>{
 const profit=await getProfitAnalysis('store',from,to);expect(profit.operatingCosts.purchasePayments).toBe(160000);expect(profit.operatingCosts.other).toBe(0);expect(profit.netProfit).toBe(0);
 const cash=await getCashFlow('store',from,to);expect(cash.outflows.inventoryPurchases).toBe(160000);expect(cash.outflows.otherExpenses).toBe(0);expect(cash.totalOutflows).toBe(160000);expect(db.stockInLog.aggregate).not.toHaveBeenCalled();
})
test('actual full refund offsets purchase cash flow, while historical stock movements never imply payment',async()=>{
 db.expense.findMany.mockResolvedValue([payment,{...payment,amount:-16000000,referenceType:'purchase_refund'}]);expect((await getCashFlow('store',from,to)).totalOutflows).toBe(0);expect((await getProfitAnalysis('store',from,to)).netProfit).toBe(0);
 db.expense.findMany.mockResolvedValue([{...payment,amount:-16000000,referenceType:'purchase_refund'}]);const refund=await getCashFlow('store',from,to);expect(refund.netCashFlow).toBe(160000);expect(refund.outflows.inventoryPurchases).toBe(-160000);
 db.expense.findMany.mockResolvedValue([]);db.stockInLog.aggregate.mockResolvedValue({_sum:{totalAmount:160000}});expect((await getCashFlow('store',from,to)).outflows.inventoryPurchases).toBe(0);expect(db.stockInLog.aggregate).not.toHaveBeenCalled();
})
test('balance sheet uses whole rupiah stock and purchase totals, excludes already-paid purchase liabilities',async()=>{
 db.inventory.findMany.mockResolvedValue([{currentStock:2300,avgCost:160000/2300}]);db.purchaseOrder.aggregate.mockResolvedValue({_sum:{totalAmount:25000}});
 const sheet=await getBalanceSheet('store',2026,10);expect(sheet.assets.inventory).toBe(160000);expect(sheet.liabilities.accountsPayable).toBe(25000);expect(sheet.netProfit.amount).toBe(0);expect(db.purchaseOrder.aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({paidAt:null})}));
})
