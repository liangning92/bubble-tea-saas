import { formatNumber } from '../../utils/numberDisplay'
import {consumptionQuantity} from '../../utils/consumptionQuantity'
import { ConsumptionAlertsWidget } from '../../components/ConsumptionAlertsWidget'
import { notifyAdmin, confirmAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import { LocalizedDateTimeInput } from '../../components/LocalizedDateTimeInput'
import { inventoryInputUnits, defaultInventoryInputUnit, inventoryLedgerQuantity, inventoryUnitFactor } from "../../utils/inventoryInputUnits";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../stores/auth";
import { inventoryApi, configApi, processRecipeApi } from "../../services/api";
import {
  formatCurrency,
  formatStockDisplay,
  formatItemName,
} from "../../utils/helpers";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Search,
  Loader2,
  Package,
  Plus,
  Edit2,
  Trash2,

} from "lucide-react";

const DEFAULT_CATEGORIES = [
  { id: "raw_material", name: "Raw Material", code: "raw_material" },
  { id: "packaging", name: "Packaging", code: "packaging" },
  { id: "finished_goods", name: "Finished Goods", code: "finished_goods" },
];

export function InventoryPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showStockIn, setShowStockIn] = useState(false);
  const [showStockOut, setShowStockOut] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [stockOutPurpose, setStockOutPurpose] = useState("withdrawal");
  const [stockForm, setStockForm] = useState({
    quantity: "",
    unitCost: "",
    note: "",
    inputUnit: "",
    expiryDate: "",
  });
  const [addForm, setAddForm] = useState({
    name: "",
    category: "raw_material",
    type: "raw_material",
    unit: "kg",
    avgCost: "",
    safetyStock: "",
    processRecipeId: "",
  });
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    code: "",
    description: "",
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => inventoryApi.list({ pageSize: 500 }),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const { data: alertsData } = useQuery({
    queryKey: ["inventory-alerts"],
    queryFn: () => inventoryApi.alerts(),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Fetch dynamic categories
  const { data: configData } = useQuery({
    queryKey: ["config", "inventory-categories", user?.storeId || ""],
    queryFn: async () => {
      const resp = await configApi.get(user?.storeId || undefined);
      return resp.data;
    },
  });

  // Fetch process recipes for semi_finished type
  const { data: recipesData } = useQuery({
    queryKey: ["process-recipes"],
    queryFn: () => processRecipeApi.list(),
  });
  const recipes = recipesData?.data?.data?.list || [];

  // Update categories when config loads
  useEffect(() => {
    if (configData?.data) {
      const cats =
        configData.data.inventory_categories ||
        configData.data["inventory_categories"];
      if (Array.isArray(cats)) {
        setCategories(cats);
      }
    }
  }, [configData]);

  const stockInMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-alerts"] });
      setShowStockIn(false);
      setSelectedItem(null);
      setStockForm({
        quantity: "",
        unitCost: "",
        note: "",
        inputUnit: "",
        expiryDate: "",
      });
    },
  });

  const stockOutMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.stockOut(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-alerts"] });
      setShowStockOut(false);
      setSelectedItem(null);
      setStockForm({
        quantity: "",
        unitCost: "",
        note: "",
        inputUnit: "",
        expiryDate: "",
      });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setShowAddItem(false);
      setAddForm({
        name: "",
        category: "raw_material",
        type: "raw_material",
        unit: "kg",
        avgCost: "",
        safetyStock: "",
        processRecipeId: "",
      });
    },
    onError: (error: any) => {
      console.error("Add inventory error:", error);
      notifyAdmin(
        error?.response?.data?.message || error.message || "Failed to add item",
      );
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      inventoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setShowEditItem(false);
      setSelectedItem(null);
    },
    onError: (error: any) => {
      console.error("Update inventory error:", error);
      notifyAdmin(error?.response?.data?.message || error.message || "Update failed");
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: any) => {
      console.error("Delete inventory error:", error);
      notifyAdmin(
        error?.response?.data?.message === "MANUAL_CORRECTION_HISTORY_RETAIN_MATERIAL" ? t("manualStockCorrection.retainMaterial") : error?.response?.data?.message || error.message || "Failed to delete",
      );
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (cats: any[]) => {
      await configApi.set(
        user?.storeId || "",
        "inventory_categories",
        cats,
        "inventory",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: "", code: "", description: "" });
    },
    onError: (error: any) => {
      console.error("Save category error:", error);
      notifyAdmin(
        error?.response?.data?.message ||
          error.message ||
          "Failed to save category",
      );
    },
  });

  const openCategoryModal = (cat?: any) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryForm({
        name: cat.name,
        code: cat.code,
        description: cat.description || "",
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: "", code: "", description: "" });
    }
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let newCategories: any[];
    if (editingCategory) {
      newCategories = categories.map((c) =>
        c.id === editingCategory.id
          ? { ...categoryForm, id: categoryForm.code }
          : c,
      );
    } else {
      newCategories = [
        ...categories,
        { ...categoryForm, id: categoryForm.code },
      ];
    }
    saveCategoryMutation.mutate(newCategories);
  };

  const handleDeleteCategory = (id: string) => {
    const newCategories = categories.filter((c) => c.id !== id);
    saveCategoryMutation.mutate(newCategories);
  };

  const getCategoryItemCount = (categoryId: string) => {
    return inventory.filter(
      (item: any) =>
        item.category === categoryId ||
        item.category === categories.find((c) => c.id === categoryId)?.code,
    ).length;
  };

  // API returns { code, data: { list } } but axios wraps it: data.data.data.list = array
  const inventory = data?.data?.data?.list || [];
  const isStockItem = (item:any) => !(item.type === "semi_finished" && item.processRecipeId);
  const isLowItem = (item:any) => isStockItem(item) && !item.calibrationRequired && (item.isLowStock || item.currentStock <= (item.effectiveSafetyStock ?? item.safetyStock ?? 0));
  const alerts = alertsData?.data || [];

  const filteredInventory = inventory.filter((item: any) => {
    const matchSearch =
      !search || item.name?.toLowerCase().includes(search.toLowerCase());
    const matchLowStock = !lowStockOnly || isLowItem(item);
    const matchCategory =
      !selectedCategory ||
      item.category === selectedCategory ||
      item.category === categories.find((c) => c.id === selectedCategory)?.code;
    return matchSearch && matchLowStock && matchCategory;
  });

  const handleStockIn = () => {
    if (!selectedItem) return;
    stockInMutation.mutate({
      inventoryId: selectedItem.id,
      storeId: user?.storeId,
      quantity: parseFloat(stockForm.quantity),
      inputUnit: stockForm.inputUnit || defaultInventoryInputUnit(selectedItem),
      unitCost:
        stockForm.unitCost === "" ? undefined : Number(stockForm.unitCost),
      note: stockForm.note,
      expiryDate: stockForm.expiryDate || undefined,
    });
  };

  const handleStockOut = () => {
    if (!selectedItem) return;
    if (stockOutPurpose === "other" && !stockForm.note.trim()) {
      notifyAdmin(t("inventoryFlow.otherReason"));
      return;
    }
    stockOutMutation.mutate({
      inventoryId: selectedItem.id,
      storeId: user?.storeId,
      quantity: parseFloat(stockForm.quantity),
      inputUnit: stockForm.inputUnit || defaultInventoryInputUnit(selectedItem),
      reason: stockOutPurpose,
      note: stockForm.note,
    });
  };

  const handleAddItem = () => {
    addItemMutation.mutate({
      storeId: user?.storeId,
      name: addForm.name,
      category: addForm.category,
      type: addForm.type,
      unit: addForm.unit,
      avgCost: parseInt(addForm.avgCost) || 0,
      safetyStock: parseInt(addForm.safetyStock) || 0,
      processRecipeId:
        addForm.type === "semi_finished"
          ? addForm.processRecipeId || null
          : null,
    });
  };

  const handleUpdateItem = () => {
    if (!selectedItem) return;
    const data = {
      name: selectedItem.name,
      category: selectedItem.category,
      type: selectedItem.type,
      processRecipeId: selectedItem.type === "semi_finished" ? selectedItem.processRecipeId || null : null,
      unit: selectedItem.unit,
      packaging: selectedItem.packaging?.unit
        ? {
            ...selectedItem.packaging,
            quantity: Number(selectedItem.packaging.quantity),
            baseUnit: selectedItem.unit,
          }
        : null,
      avgCost: parseInt(selectedItem.avgCost) || 0,
      safetyStock: parseFloat(selectedItem.safetyStock) || 0,
    };
    updateItemMutation.mutate({
      id: selectedItem.id,
      data,
    });
  };

  const handleDeleteItem = async (id: string) => {
    if (!await confirmAdmin(t("common.confirmDelete"))) return;
    deleteItemMutation.mutate(id);
  };

  const getCategoryName = (code: string) => {
    const cat = categories.find((c) => c.code === code || c.id === code);
    return cat?.name || code;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3"><h1>{t("operations.inventoryOverview")}</h1>
        <button
          onClick={() => setShowAddItem(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} />
          {t("operations.addMaterial")}
        </button>
      </div>

      <p className="text-sm text-gray-600">{t("inventoryUnified.hint")}</p><div className="grid grid-cols-3 gap-3">{[["materials",inventory.length],["lowStock",inventory.filter(isLowItem).length],["outOfStock",inventory.filter((item:any)=>isStockItem(item)&&!item.calibrationRequired&&item.currentStock<=0).length]].map(([key,value])=><div className="rounded-xl border bg-white p-4" key={key}><p className="text-sm text-gray-500">{t("operations."+key)}</p><p className="text-2xl font-semibold tabular-nums mt-1">{formatNumber(isLoading||isError||key!=='materials'&&inventory.some((item:any)=>item.calibrationRequired)?'—':value)}</p></div>)}</div>
      {isError&&<p role="alert" className="text-red-700"><button type="button" onClick={()=>refetch()}>{t("common.error")} · {t("operations.refresh")}</button></p>}
      <ConsumptionAlertsWidget compact />
      {/* 分类看板 */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        <div
          onClick={() => setSelectedCategory(null)}
          className={`flex-shrink-0 w-auto min-w-[160px] max-w-[260px] p-3 rounded-xl cursor-pointer transition-all border-2 ${
            selectedCategory === null
              ? "bg-white border-primary shadow-sm"
              : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
          }`}
        >
          <div className="text-center">
            <p
              className={`text-sm font-semibold ${selectedCategory === null ? "text-primary" : "text-gray-700"}`}
            >
              {t("common.all")}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {inventory.length} {t("operations.materials")}
            </p>
          </div>
        </div>

        {categories.map((cat) => {
          const count = getCategoryItemCount(cat.id);
          return (
            <div
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-shrink-0 w-auto min-w-[160px] max-w-[260px] p-3 rounded-xl cursor-pointer transition-all border-2 ${
                selectedCategory === cat.id
                  ? "bg-white border-primary shadow-sm"
                  : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold truncate ${selectedCategory === cat.id ? "text-primary" : "text-gray-700"}`}
                  >
                    {cat.name}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {count} {t("operations.materials")}
                  </p>
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openCategoryModal(cat);
                    }}
                    className="btn-sm p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirmAdmin(t("inventory.deleteCategoryConfirm"))) {
                        handleDeleteCategory(cat.id);
                      }
                    }}
                    className="btn-sm p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* 添加分类按钮 */}
        <div
          onClick={() => openCategoryModal()}
          className="flex-shrink-0 w-auto min-w-[160px] max-w-[260px] p-3 rounded-xl cursor-pointer transition-all border-2 border-dashed border-gray-200 hover:border-gray-300 hover:shadow-sm flex items-center justify-center"
        >
          <div className="text-center text-gray-400">
            <Plus size={18} className="mx-auto mb-1" />
            <p className="text-xs">{t("inventory.addCategory")}</p>
          </div>
        </div>
      </div>

      <details className="text-sm"><summary className="cursor-pointer text-gray-600">{t("inventory.lowStockAlert")}</summary>
      {/* Low Stock Alert */}
      {alerts.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
            <AlertTriangle size={20} />
            {t("inventory.lowStockAlert")} ({alerts.length}{" "}
            {t("inventory.items")})
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.slice(0, 10).map((item: any) => (
              <span key={item.id} className="badge badge-error">
                {formatItemName(item, i18n.language)}:{" "}
                {item.type==='semi_finished'&&item.processRecipeId?t('inventoryProcessing.virtual'):formatStockDisplay(item.currentStock, item.unit)}{item.calibrationRequired&&<p className="text-xs text-amber-700 mt-1">{t('inventoryUnified.calibrate')}</p>}
              </span>
            ))}
            {alerts.length > 10 && (
              <span className="text-red-600 text-sm">
                +{alerts.length - 10} {t("inventory.moreItems")}
              </span>
            )}
          </div>
        </div>
      )}

      </details>
      {/* Search & Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search") || "Search..."}
            className="input pl-10 w-full"
          />
        </div>
        <button
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={`btn-secondary flex items-center gap-2 ${lowStockOnly ? "bg-red-50 border-red-200 text-red-600" : ""}`}
        >
          <AlertTriangle size={18} />
          {t("inventory.lowStock") || "Low Stock"}
        </button>
      </div>

      {/* Inventory Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Package size={48} className="mb-2 opacity-50" />
            <p>{t("common.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-stock-table w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="py-3 pr-4 font-medium">
                    {t("inventory.itemName") || "Name"}
                  </th>
                  <th className="py-3 px-2 font-medium">
                    {t("inventory.category") || "Category"}
                  </th>
                  <th className="py-3 px-2 font-medium text-right">
                    {t("inventoryUnified.estimate") || "Stock"}
                  </th>
                  <th className="py-3 px-2 font-medium text-right">
                    {t("inventory.unit") || "Unit"}
                  </th>
                  <th className="py-3 px-2 font-medium text-right">
                    {t("inventory.avgCost") || "Cost"}
                  </th>
                  <th className="py-3 px-2 font-medium text-right">
                    {t("inventory.safetyStock") || "Safety"}
                  </th>
                  <th className="py-3 pl-4 font-medium text-center">
                    {t("common.actions") || "Actions"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item: any) => {
                  const isLow = isLowItem(item);
                  return (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 hover:bg-gray-50 ${isLow ? "bg-red-50/30" : ""}`}
                    >
                      <td
                        data-label={t("inventory.itemName")}
                        className="py-3 pr-4"
                      >
                        <span className="font-medium text-gray-900">
                          {formatItemName(item, i18n.language)}
                        </span>
                        {isLow && (
                          <AlertTriangle
                            size={16}
                            className="inline ml-2 text-red-500"
                          />
                        )}
                      </td>
                      <td
                        data-label={t("inventory.category")}
                        className="py-3 px-2 text-gray-600"
                      >
                        {getCategoryName(item.category)}
                      </td>
                      <td
                        data-label={t("inventoryUnified.estimate")}
                        className="py-3 px-2 text-right"
                      >
                        <span
                          className={`font-bold ${isLow && !item.calibrationRequired ? "text-red-600" : "text-gray-900"}`}
                        >
                          {item.type==='semi_finished'&&item.processRecipeId?t('inventoryProcessing.virtual'):formatStockDisplay(item.currentStock, item.unit)}{item.calibrationRequired&&<p className="text-xs text-amber-700 mt-1">{t('inventoryUnified.calibrate')}</p>}
                        </span>
                      </td>
                      <td
                        data-label={t("inventory.unit")}
                        className="py-3 px-2 text-right text-gray-500"
                      >
                        {item.unit}
                      </td>
                      <td
                        data-label={t("inventory.avgCost")}
                        className="py-3 px-2 text-right"
                      >
                        {formatCurrency(item.avgCost)}
                      </td>
                      <td
                        data-label={t("inventory.safetyStock")}
                        className="py-3 px-2 text-right text-gray-500"
                      >
                        {Number(
                          (
                            item.effectiveSafetyStock ??
                            item.safetyStock ??
                            0
                          ).toFixed(0),
                        )}{" "}
                        {item.unit}
                      </td>
                      <td
                        data-label={t("common.actions")}
                        className="py-3 pl-4"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setStockForm({ quantity: "", unitCost: "", note: "", inputUnit: defaultInventoryInputUnit(item), expiryDate: "" });
                              setShowStockIn(true);
                            }}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            disabled={item.type==='semi_finished'&&!!item.processRecipeId}
                            title={t("inventory.stockIn") || "Stock In"}
                          >
                            <TrendingUp size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setStockForm({ quantity: "", unitCost: "", note: "", inputUnit: defaultInventoryInputUnit(item), expiryDate: "" });
                              setShowStockOut(true);
                            }}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
                            disabled={item.type==='semi_finished'&&!!item.processRecipeId}
                            title={t("inventory.stockOut") || "Stock Out"}
                          >
                            <TrendingDown size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedItem({ ...item });
                              setShowEditItem(true);
                            }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title={t("common.edit") || "Edit"}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title={t("common.delete") || "Delete"}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Item Modal */}
      {showAddItem && (
        <AdminDialog title={t("operations.addMaterial")} onClose={() => setShowAddItem(false)} className="max-w-md" busy={Boolean(addItemMutation.isPending)} trackChanges chrome>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("inventory.itemName") || "Item Name"} *
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) =>
                    setAddForm({ ...addForm, name: e.target.value })
                  }
                  className="input w-full"
                  placeholder={
                    t("inventory.namePlaceholder") || "e.g. Cream, Syrup"
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.category") || "Category"}
                  </label>
                  <select
                    value={addForm.category}
                    onChange={(e) =>
                      setAddForm({ ...addForm, category: e.target.value })
                    }
                    className="input w-full"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.code || cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.materialType") || "Material Type"}
                  </label>
                  <select
                    value={addForm.type}
                    onChange={(e) =>
                      setAddForm({ ...addForm, type: e.target.value })
                    }
                    className="input w-full"
                  >
                    <option value="raw_material">
                      {t("material.typeRawMaterial")}
                    </option>
                    <option value="semi_finished">
                      {t("material.typeSemiFinished")}
                    </option>
                    <option value="finished_goods">
                      {t("material.typeFinishedGoods")}
                    </option>
                  </select>
                </div>
              </div>
              {addForm.type === "semi_finished" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("material.linkedRecipe")}
                  </label>
                  <select
                    value={addForm.processRecipeId}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        processRecipeId: e.target.value,
                      })
                    }
                    className="input w-full"
                  >
                    <option value="">
                      {t("inventory.selectRecipe") || "Select Recipe"}
                    </option>
                    {recipes.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.name} → {r.outputName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="block text-sm font-medium">
                {t("inventory.unit")}
                <select className="input w-full mt-1" value={addForm.unit} onChange={e => setAddForm({ ...addForm, unit: e.target.value })}>
                  {["kg", "g", "L", "ml", "pcs", "bottle", "roll", "pack", "slice"].map(unit => <option key={unit}>{unit}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.avgCost") || "Avg Cost"} (Rp)
                  </label>
                  <input
                    type="number"
                    value={addForm.avgCost}
                    onChange={(e) =>
                      setAddForm({ ...addForm, avgCost: e.target.value })
                    }
                    className="input w-full"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.safetyStock") || "Safety Stock"}
                  </label>
                  <input
                    type="number"
                    value={addForm.safetyStock}
                    onChange={(e) =>
                      setAddForm({ ...addForm, safetyStock: e.target.value })
                    }
                    className="input w-full"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="admin-dialog-footer flex gap-3 mt-6">
              <button
                onClick={() => setShowAddItem(false)}
                className="btn-secondary flex-1"
               data-dialog-close="true">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleAddItem}
                className="btn-primary flex-1"
                disabled={!addForm.name || addItemMutation.isPending}
              >
                {addItemMutation.isPending
                  ? t("common.loading")
                  : t("common.save")}
              </button>
            </div>
          </AdminDialog>
      )}

      {/* Edit Item Modal */}
      {showEditItem && selectedItem && (
        <AdminDialog title={t("common.edit") || "Edit Item"} onClose={() => setShowEditItem(false)} className="max-w-md" busy={Boolean(updateItemMutation.isPending)} trackChanges chrome>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("inventory.itemName") || "Item Name"}
                </label>
                <input
                  type="text"
                  value={selectedItem.name}
                  onChange={(e) =>
                    setSelectedItem({ ...selectedItem, name: e.target.value })
                  }
                  className="input w-full"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.category") || "Category"}
                  </label>
                  <select
                    value={selectedItem.category}
                    onChange={(e) =>
                      setSelectedItem({
                        ...selectedItem,
                        category: e.target.value,
                      })
                    }
                    className="input w-full"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.code || cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.unit") || "Unit"}
                  </label>
                  <select
                    disabled
                    value={selectedItem.unit}
                    onChange={(e) =>
                      setSelectedItem({ ...selectedItem, unit: e.target.value })
                    }
                    className="input w-full"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pcs</option>
                    <option value="bottle">bottle</option>
                    <option value="roll">roll</option>
                    <option value="pack">pack</option>
                    <option value="box">box</option>
                    <option value="set">set</option>
                    <option value="cup">cup</option>
                    <option value="item">item</option>
                  </select>
                </div>
              </div>
              <label className="block text-sm font-medium">{t("inventory.materialType")}
                <select className="input w-full mt-1" value={selectedItem.type || "raw_material"} onChange={e=>setSelectedItem({...selectedItem,type:e.target.value,processRecipeId:null})}>
                  <option value="raw_material">{t("material.typeRawMaterial")}</option><option value="semi_finished">{t("material.typeSemiFinished")}</option><option value="finished_goods">{t("material.typeFinishedGoods")}</option>
                </select>
              </label>
              {selectedItem.type === "semi_finished" && <label className="block text-sm font-medium">{t("material.linkedRecipe")}
                <select className="input w-full mt-1" value={selectedItem.processRecipeId || ""} onChange={e=>setSelectedItem({...selectedItem,processRecipeId:e.target.value})}>
                  <option value="">{t("inventory.selectRecipe")}</option>{recipes.map((recipe:any)=><option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                </select>
              </label>}
              <p className="text-sm text-amber-700">
                {t("inventoryUnits.fixed")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label>
                  {t("inventoryUnits.pack")}
                  <input
                    className="input w-full"
                    value={selectedItem.packaging?.unit || ""}
                    onChange={(e) =>
                      setSelectedItem({
                        ...selectedItem,
                        packaging: {
                          ...selectedItem.packaging,
                          unit: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {t("inventoryUnits.factor")} ({selectedItem.unit})
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    className="input w-full"
                    value={selectedItem.packaging?.quantity || ""}
                    onChange={(e) =>
                      setSelectedItem({
                        ...selectedItem,
                        packaging: {
                          ...selectedItem.packaging,
                          quantity: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventoryUnified.estimate") || "Current Stock"}
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={selectedItem.currentStock}
                    onChange={(e) =>
                      setSelectedItem({
                        ...selectedItem,
                        currentStock: e.target.value,
                      })
                    }
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.avgCost") || "Avg Cost"} (Rp)
                  </label>
                  <input
                    type="number"
                    value={selectedItem.avgCost}
                    onChange={(e) =>
                      setSelectedItem({
                        ...selectedItem,
                        avgCost: e.target.value,
                      })
                    }
                    className="input w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("inventory.safetyStock") || "Safety Stock"}
                  </label>
                  <input
                    type="number"
                    value={selectedItem.safetyStock}
                    onChange={(e) =>
                      setSelectedItem({
                        ...selectedItem,
                        safetyStock: e.target.value,
                      })
                    }
                    className="input w-full"
                  />
                </div>
              </div>
            </div>
            <div className="admin-dialog-footer flex gap-3 mt-6">
              <button
                onClick={() => setShowEditItem(false)}
                className="btn-secondary flex-1"
               data-dialog-close="true">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleUpdateItem}
                className="btn-primary flex-1"
                disabled={updateItemMutation.isPending}
              >
                {updateItemMutation.isPending
                  ? t("common.loading")
                  : t("common.save")}
              </button>
            </div>
          </AdminDialog>
      )}

      {/* Stock In Modal */}
      {showStockIn && selectedItem && (
        <AdminDialog title={[t("inventory.stockIn"), "-", " ", formatItemName(selectedItem, i18n.language)].join(" ")} onClose={() => setShowStockIn(false)} className="max-w-md" busy={Boolean(stockInMutation.isPending)} trackChanges chrome>

            <div className="space-y-4">
              <label className="block">
                {t("inventoryUnits.input")}
                <select
                  className="input w-full"
                  value={stockForm.inputUnit || defaultInventoryInputUnit(selectedItem)}
                  onChange={(e) =>
                    setStockForm({
                      ...stockForm,
                      inputUnit: e.target.value,
                      unitCost: "",
                    })
                  }
                >
                  {inventoryInputUnits(selectedItem).map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {t("inventoryAlerts.expiryDate")}
                <LocalizedDateTimeInput
                  type="date"
                  className="input w-full"
                  value={stockForm.expiryDate}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, expiryDate: e.target.value })
                  }
                />
              </label>
              <p className="text-sm">
                {t("inventoryUnits.cost")} (
                {stockForm.inputUnit || defaultInventoryInputUnit(selectedItem)})
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("inventory.quantity") || "Quantity"} (
                  {stockForm.inputUnit || defaultInventoryInputUnit(selectedItem)}) *
                </label>
                <input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, quantity: e.target.value })
                  }
                  className="input w-full"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("inventory.unitCost") || "Unit Cost"} (Rp)
                </label>
                <input
                  type="number"
                  value={stockForm.unitCost}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, unitCost: e.target.value })
                  }
                  className="input w-full"
                  placeholder={String((selectedItem.avgCost || 0) * inventoryUnitFactor(selectedItem, stockForm.inputUnit || defaultInventoryInputUnit(selectedItem)))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("common.note") || "Note"}
                </label>
                <input
                  type="text"
                  value={stockForm.note}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, note: e.target.value })
                  }
                  className="input w-full"
                />
              </div>
            </div>
            <div className="admin-dialog-footer flex gap-3 mt-6">
              <button
                onClick={() => setShowStockIn(false)}
                className="btn-secondary flex-1"
               data-dialog-close="true">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleStockIn}
                className="btn-primary flex-1"
                disabled={!stockForm.quantity || stockInMutation.isPending}
              >
                {stockInMutation.isPending
                  ? t("common.loading")
                  : t("inventory.stockIn")}
              </button>
            </div>
          </AdminDialog>
      )}

      {/* Stock Out Modal */}
      {showStockOut && selectedItem && (
        <AdminDialog title={[t("inventory.stockOut"), "-", " ", formatItemName(selectedItem, i18n.language)].join(" ")} onClose={() => setShowStockOut(false)} className="max-w-md" busy={Boolean(stockOutMutation.isPending)} trackChanges chrome>

            <div className="space-y-4">
              <label className="block">
                {t("inventoryUnified.hint")}<br/>{t("inventoryFlow.purpose")}
                <select
                  className="input w-full"
                  value={stockOutPurpose}
                  onChange={(e) => setStockOutPurpose(e.target.value)}
                >
                  {["withdrawal", "loss", "expired", "other"].map((p) => (
                    <option key={p} value={p}>
                      {t("inventoryFlow." + p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {t("inventoryUnits.input")}
                <select className="input w-full" value={stockForm.inputUnit || defaultInventoryInputUnit(selectedItem)} onChange={e => setStockForm({ ...stockForm, inputUnit: e.target.value })}>
                  {inventoryInputUnits(selectedItem).map(unit => <option key={unit}>{unit}</option>)}
                </select>
              </label>
              <p>
                {t("inventoryUnified.estimate")}: {consumptionQuantity(Number(selectedItem.currentStock),i18n.language)}{" "}
                {selectedItem.unit}
              </p>
              <p>
                {t("inventoryFlow.afterStock")}:{" "}
                {consumptionQuantity(selectedItem.currentStock - (stockOutPurpose==='withdrawal'&&selectedItem.unifiedStock?0:inventoryLedgerQuantity(Number(stockForm.quantity) || 0, selectedItem, stockForm.inputUnit || defaultInventoryInputUnit(selectedItem))),i18n.language)}{" "}
                {selectedItem.unit}
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("inventory.quantity") || "Quantity"} ({stockForm.inputUnit || defaultInventoryInputUnit(selectedItem)})
                  *
                </label>
                <input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, quantity: e.target.value })
                  }
                  className="input w-full"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("common.note") || "Note"}
                </label>
                <input
                  type="text"
                  value={stockForm.note}
                  onChange={(e) =>
                    setStockForm({ ...stockForm, note: e.target.value })
                  }
                  className="input w-full"
                />
              </div>
            </div>
            <div className="admin-dialog-footer flex gap-3 mt-6">
              <button
                onClick={() => setShowStockOut(false)}
                className="btn-secondary flex-1"
               data-dialog-close="true">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleStockOut}
                className="btn-primary flex-1"
                disabled={!stockForm.quantity || stockOutMutation.isPending}
              >
                {stockOutMutation.isPending
                  ? t("common.loading")
                  : t("inventory.stockOut")}
              </button>
            </div>
          </AdminDialog>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <AdminDialog title={editingCategory
                  ? t("inventory.editCategory")
                  : t("inventory.addCategory")} onClose={() => setShowCategoryModal(false)} className="max-w-sm" busy={Boolean(saveCategoryMutation.isPending)} trackChanges chrome>

            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inventory.categoryName")} *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, name: e.target.value })
                  }
                  className="input w-full"
                  placeholder={t("inventory.categoryNamePlaceholder")}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inventory.categoryCode")} *
                </label>
                <input
                  type="text"
                  value={categoryForm.code}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      code: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                    })
                  }
                  className="input w-full"
                  placeholder={t("inventory.categoryCodePlaceholder")}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("inventory.description")}
                </label>
                <input
                  type="text"
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      description: e.target.value,
                    })
                  }
                  className="input w-full"
                  placeholder={t("inventory.descriptionPlaceholder")}
                />
              </div>
              <div className="admin-dialog-footer flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="btn-secondary flex-1"
                 data-dialog-close="true">
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={saveCategoryMutation.isPending}
                >
                  {saveCategoryMutation.isPending
                    ? t("common.loading")
                    : t("common.save")}
                </button>
              </div>
            </form>
          </AdminDialog>
      )}
    </div>
  );
}
