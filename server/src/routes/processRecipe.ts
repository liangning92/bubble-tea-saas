import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../middlewares/auth'
import { validateBody } from '../utils/validation'
import * as ProcessRecipeService from '../services/ProcessRecipeService'

const router = Router()

const createSchema = z.object({
  storeId: z.string(),
  name: z.string().min(1),
  outputUnit: z.string(),
  inputs: z.array(z.object({
    inventoryId: z.string(),
    quantity: z.number().positive()
  })),
  outputs: z.array(z.object({
    name: z.string(),
    quantity: z.number().positive()
  }))
})

const executeSchema = z.object({
  multiplier: z.number().positive().optional().default(1)
})

// GET /api/process-recipes
router.get('/', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId
    const recipes = await ProcessRecipeService.getRecipes(storeId)
    res.json({ code: 200, data: { list: recipes }, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Get recipes error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get recipes' })
  }
})

// GET /api/process-recipes/:id
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const recipe = await ProcessRecipeService.getRecipeById(req.params.id)
    if (!recipe) return res.status(404).json({ code: 404, message: 'Recipe not found' })
    res.json({ code: 200, data: recipe, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Get recipe error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to get recipe' })
  }
})

// POST /api/process-recipes
router.post('/', authenticate, authorize('admin', 'manager'), validateBody(createSchema), async (req: AuthRequest, res) => {
  try {
    const recipe = await ProcessRecipeService.createRecipe(req.body)
    res.status(201).json({ code: 201, message: 'Recipe created', data: recipe, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Create recipe error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to create recipe' })
  }
})

// POST /api/process-recipes/:id/execute
router.post('/:id/execute', authenticate, authorize('admin', 'manager', 'staff'), validateBody(executeSchema), async (req: AuthRequest, res) => {
  try {
    const result = await ProcessRecipeService.executeRecipe(req.params.id, req.body.multiplier)
    res.json({ code: 200, message: 'Recipe executed', data: result, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Execute recipe error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to execute recipe' })
  }
})

// PUT /api/process-recipes/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req: AuthRequest, res) => {
  try {
    const recipe = await ProcessRecipeService.updateRecipe(req.params.id, req.body)
    res.json({ code: 200, message: 'Recipe updated', data: recipe, timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Update recipe error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to update recipe' })
  }
})

// DELETE /api/process-recipes/:id
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res) => {
  try {
    await ProcessRecipeService.deleteRecipe(req.params.id)
    res.json({ code: 200, message: 'Recipe deleted', timestamp: new Date().toISOString() })
  } catch (error: any) {
    console.error('Delete recipe error:', error)
    res.status(500).json({ code: 500, message: error.message || 'Failed to delete recipe' })
  }
})

export { router as processRecipeRouter }
