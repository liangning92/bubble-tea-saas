import {convertQuantity} from '../utils/inventoryUnits'
import prisma from '../config/database'

// Get all recipes for a store
export async function getRecipes(storeId: string) {
  return prisma.processRecipe.findMany({
    where: { storeId },
    include: {
      items: {
        include: {
          inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
        }
      }
    },
    orderBy: { name: 'asc' }
  })
}

// Get recipe by ID
export async function getRecipeById(recipeId: string) {
  return prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: {
      items: {
        include: {
          inventory: { select: { id: true, name: true, unit: true, currentStock: true } }
        }
      }
    }
  })
}

// Create recipe
export async function createRecipe(data: {
  storeId: string
  name: string
  outputUnit: string
  inputs: { inventoryId: string; quantity: number }[]
  outputs: { name: string; quantity: number }[]
}) {
  return prisma.processRecipe.create({
    data: {
      storeId: data.storeId,
      name: data.name,
      outputUnit: data.outputUnit,
      items: {
        create: [
          ...data.inputs.map(i => ({
            inventoryId: i.inventoryId,
            quantity: i.quantity,
            type: 'input' as const
          })),
          ...data.outputs.map(o => ({
            name: o.name,
            quantity: o.quantity,
            type: 'output' as const
            // inventoryId 留空，产出不需要关联库存
          }))
        ]
      }
    },
    include: {
      items: true
    }
  })
}

// Execute recipe (process)
export async function executeRecipe(recipeId: string, multiplier: number = 1) {
  const recipe = await prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: {
      items: {
        include: { inventory: true }
      }
    }
  })

  if (!recipe) throw new Error('Recipe not found')

  const inputs = recipe.items.filter(i => i.type === 'input')
  const outputs = recipe.items.filter(i => i.type === 'output')

  return prisma.$transaction(async (tx) => {
    // 计算总投入成本
    let totalInputCost = 0
    for (const input of inputs) {
      if (!input.inventoryId || !input.inventory) continue
      const inv = input.inventory
      const deductQty = input.quantity * multiplier
      // Recipe inputs are stored in each input material's existing inventory unit.
      const unitCost = Number(inv.avgCost || 0)

      totalInputCost += deductQty * unitCost

      // 扣减投入库存
      await tx.inventory.update({
        where: { id: input.inventoryId },
        data: { currentStock: { decrement: deductQty } }
      })
      await tx.stockOutLog.create({
        data: {
          inventoryId: input.inventoryId,
          quantity: deductQty,
          reason: 'process',
          note: `加工: ${recipe.name}`
        }
      })
    }

    // 计算总产出数量
    let totalOutputQty = 0
    for (const output of outputs) {
      totalOutputQty += output.quantity * multiplier
    }

    // 计算产出单位成本 = 总投入成本 / 总产出数量
    if(totalOutputQty<=0)throw new Error('INVALID_PROCESS_OUTPUT')
    const outputUnitCost = totalInputCost / totalOutputQty
    let cumulativeOutput=0,allocatedCost=0

    // 添加产出到库存（按名称查找或创建）
    for (const output of outputs) {
      const recipeQty = output.quantity * multiplier
      const outputName = output.name

      if (!outputName) throw new Error('INVALID_PROCESS_OUTPUT')

      // 查找或创建产出库存
      let outputInv = await tx.inventory.findFirst({
        where: {
          storeId: recipe.storeId,
          name: outputName
        }
      })

      if (!outputInv) {
        // 创建新库存并关联配方
        outputInv = await tx.inventory.create({
          data: {
            storeId: recipe.storeId,
            name: outputName,
            category: '加工产出',
            type: 'semi_finished',
            unit: recipe.outputUnit || 'g',
            currentStock: 0,
            avgCost: 0,
            processRecipeId: recipe.id  // 关联到配方！
          }
        })
      }

      const addQty=convertQuantity(recipeQty,recipe.outputUnit,outputInv.unit)
      cumulativeOutput+=recipeQty
      const cumulativeCost=Math.round(totalInputCost*cumulativeOutput/totalOutputQty)
      const outputTotalCost=cumulativeCost-allocatedCost
      allocatedCost=cumulativeCost
      const ledgerUnitCost=outputTotalCost/addQty
      // 加权平均计算新均价
      const currentStock = outputInv.currentStock || 0
      const currentAvgCost = outputInv.avgCost || 0
      const newTotalStock = currentStock + addQty
      const newAvgCost = newTotalStock > 0
        ? Math.round((Number(currentStock) * Number(currentAvgCost) + outputTotalCost) / newTotalStock)
        : Math.round(ledgerUnitCost)

      await tx.inventory.update({
        where: { id: outputInv.id },
        data: {
          currentStock: { increment: addQty },
          avgCost: newAvgCost
        }
      })
      await tx.stockInLog.create({
        data: {
          inventoryId: outputInv.id,
          quantity: addQty,
          unitCost: Math.round(ledgerUnitCost),
          totalAmount: Math.round(outputTotalCost),
          note: `加工产出: ${recipe.name}`
        }
      })
    }

    return {
      success: true,
      recipe: recipe.name,
      multiplier,
      totalInputCost,
      outputUnitCost
    }
  })
}

// Update recipe
export async function updateRecipe(recipeId: string, data: {
  name?: string
  outputUnit?: string
  status?: string
}) {
  return prisma.processRecipe.update({
    where: { id: recipeId },
    data
  })
}

// Delete recipe
export async function deleteRecipe(recipeId: string) {
  return prisma.processRecipe.delete({
    where: { id: recipeId }
  })
}
