import { useStoreDateSettings } from "../../hooks/useStoreDateSettings";
import { InventoryCountAdjustments } from "../../components/InventoryCountAdjustments";
import { useSearchParams } from "react-router-dom";
import {
  EmployeeAccessContext,
  useEmployeePermission,
} from "../../contexts/EmployeeAccess";
import {
  countStatuses,
  countStatusFilter,
} from "../../utils/inventoryCountFlow";
import { PageHelp } from "../../components/PageHelp";
import { useState, useEffect, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { inventoryApi } from "../../services/api";
import { useAuthStore } from "../../stores/auth";
import { formatItemName, formatDateTime } from "../../utils/helpers";
import {
  Loader2,
  Plus,
  Package,
  Check,
  X,
  Clock,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

interface InventoryCount {
  id: string;
  storeId: string;
  period: string;
  status: string;
  startDate: string;
  endDate: string;
  notes?: string;
  items: InventoryCountItem[];
  createdAt: string;
  updatedAt?: string;
}

interface InventoryCountItem {
  id: string;
  inventoryId: string;
  systemQty: number;
  countedQty?: number | null;
  variance?: number | null;
  countedAt?: string;
  movementSinceObservation?: number;
  varianceAmountEstimate?: number;
  countedBy?: string;
  note?: string;
  inventory?: {
    id: string;
    name: string;
    unit: string;
    currentStock: number;
    updatedAt: string;
  };
}

export function InventoryCountPage() {
  const { t, i18n } = useTranslation();
  useStoreDateSettings();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const storeId = user?.storeId || "";

  const [searchParams, setSearchParams] = useSearchParams();
  const countId = searchParams.get("countId") || "";
  const statusFilter = countStatusFilter(searchParams.get("status"));
  const access = useContext(EmployeeAccessContext);
  const allowedCount = useEmployeePermission("inventory.count");
  const v2 = access.role?.version === 2;
  const canCreate =
    allowedCount &&
    (v2 || ["admin", "manager", "staff"].includes(user?.role || ""));
  const canEdit =
    allowedCount &&
    (v2 || ["admin", "manager", "staff", "cashier"].includes(user?.role || ""));
  const canSubmit = canCreate;
  const canApprove =
    allowedCount && (v2 || ["admin", "manager"].includes(user?.role || ""));
  const canReadCost =
    useEmployeePermission("cost.read") &&
    (v2 || ["admin", "manager"].includes(user?.role || ""));
  const showList = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("countId");
      next.delete("itemId");
      return next;
    });
  const openCount = (id: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("countId", id);
      next.delete("itemId");
      return next;
    });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCountForm, setNewCountForm] = useState({
    period: "ad_hoc" as "ad_hoc" | "monthly" | "quarterly" | "annual",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Fetch inventory counts
  const {
    data: countsData,
    isLoading,
    isError: countsError,
  } = useQuery({
    queryKey: ["inventory-counts", storeId],
    queryFn: () => inventoryApi.getInventoryCounts(),
    enabled: !!storeId,
  });

  const counts: InventoryCount[] = countsData?.data?.data?.list || [];

  const filteredCounts = counts.filter(
    (count) => statusFilter === "all" || count.status === statusFilter,
  );
  const detailQuery = useQuery({
    queryKey: ["inventory-count", storeId, countId],
    queryFn: () => inventoryApi.getInventoryCount(countId),
    enabled: !!storeId && !!countId,
    retry: false,
  });
  const selectedCount: InventoryCount | null =
    detailQuery.data?.data?.data || null;
  const refreshCounts = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory-counts", storeId] });
    queryClient.invalidateQueries({ queryKey: ["inventory-count", storeId] });
    queryClient.invalidateQueries({ queryKey: ["stock-logs"] });
    queryClient.invalidateQueries({
      queryKey: ["inventory-logs-comprehensive"],
    });
    queryClient.invalidateQueries({ queryKey: ["inventory-all-items"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };
  useEffect(() => {
    const itemId = searchParams.get("itemId");
    if (selectedCount && itemId)
      document
        .getElementById("count-item-" + itemId)
        ?.scrollIntoView({ block: "center" });
  }, [selectedCount, searchParams]);
  const showError = (error: any) => {
    alert(error?.response?.data?.message || t("countFlow.refresh"));
    refreshCounts();
  };
  // Create mutation
  const createMutation = useMutation({
    onError: showError,
    mutationFn: (data: any) => inventoryApi.createInventoryCount(data),
    onSuccess: (response) => {
      refreshCounts();
      if (response.data?.data?.id) openCount(response.data.data.id);
      setShowCreateModal(false);
      setNewCountForm({
        period: "ad_hoc",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        notes: "",
      });
    },
  });

  // Update count item mutation
  const updateItemMutation = useMutation({
    onError: showError,
    mutationFn: ({
      countId,
      itemId,
      data,
    }: {
      countId: string;
      itemId: string;
      data: any;
    }) => inventoryApi.updateInventoryCountItem(countId, itemId, data),
    onSuccess: () => {
      refreshCounts();
      queryClient.invalidateQueries({
        queryKey: ["inventory-count", storeId, countId],
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.submitInventoryCount(id),
    onError: showError,
    onSuccess: refreshCounts,
  });

  // Complete count mutation
  const completeMutation = useMutation({
    onError: showError,
    mutationFn: (id: string) => inventoryApi.completeInventoryCount(id),
    onSuccess: () => {
      refreshCounts();
      if (selectedCount) {
        queryClient.invalidateQueries({
          queryKey: ["inventory-count", storeId, countId],
        });
      }
    },
  });

  // Cancel count mutation
  const cancelMutation = useMutation({
    onError: showError,
    mutationFn: (id: string) => inventoryApi.cancelInventoryCount(id),
    onSuccess: () => {
      refreshCounts();
      showList();
    },
  });

  const handleCreateCount = () => {
    if (
      !storeId ||
      !canCreate ||
      !newCountForm.startDate ||
      !newCountForm.endDate ||
      newCountForm.startDate > newCountForm.endDate
    )
      return;
    createMutation.mutate({
      storeId,
      ...newCountForm,
      startDate: new Date(newCountForm.startDate).toISOString(),
      endDate: new Date(newCountForm.endDate).toISOString(),
    });
  };

  const handleUpdateItem = (
    item: InventoryCountItem,
    countedQty: number,
    note?: string,
  ) => {
    if (!selectedCount || !canEdit || selectedCount.status !== "in_progress")
      return;
    updateItemMutation.mutate({
      countId: selectedCount.id,
      itemId: item.id,
      data: {
        countedQty,
        countedBy: user?.staff?.id || "",
        note,
        expectedStock: item.inventory?.currentStock,
        observedVersion: item.inventory?.updatedAt,
      },
    });
  };

  const handleComplete = () => {
    if (
      !selectedCount ||
      !canApprove ||
      selectedCount.status !== "pending_review"
    )
      return;
    if (!confirm(t("inventory.confirmCompleteCount"))) return;
    completeMutation.mutate(selectedCount.id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_review":
        return (
          <span className="badge badge-warning">
            {t("inventoryFlow.pendingReview")}
          </span>
        );
      case "completed":
        return (
          <span className="badge badge-success">
            {t("inventory.completed")}
          </span>
        );
      case "in_progress":
        return (
          <span className="badge badge-warning">
            {t("inventory.inProgress")}
          </span>
        );
      case "cancelled":
        return (
          <span className="badge badge-secondary">
            {t("inventory.cancelled")}
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case "monthly":
        return t("inventory.monthly");
      case "quarterly":
        return t("inventory.quarterly");
      case "annual":
        return t("inventory.annual");
      case "ad_hoc":
        return t("inventoryFlow.adHoc");
      default:
        return period;
    }
  };

  // List View
  const renderListView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("inventoryCountWorkspace.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("inventoryCountWorkspace.hint")}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            {t("inventory.newCount")}
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label={t("inventoryCountWorkspace.statusFilter")}
        className="flex flex-wrap gap-2"
      >
        {countStatuses.map((status) => (
          <button
            key={status}
            role="tab"
            aria-selected={statusFilter === status}
            className={`px-4 py-2 rounded-lg text-sm ${statusFilter === status ? "bg-primary text-white" : "bg-white border text-gray-600"}`}
            onClick={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("status", status);
                return next;
              })
            }
          >
            {t("inventoryCountWorkspace." + status)}
            {status !== "adjustments" &&
              ` (${status === "all" ? counts.length : counts.filter((c) => c.status === status).length})`}
          </button>
        ))}
      </div>

      {/* Count List */}
      {statusFilter === "adjustments" ? (
        <InventoryCountAdjustments storeId={storeId} />
      ) : countsError ? (
        <div className="card">
          <p role="alert">{t("inventoryCountWorkspace.historyFailed")}</p>
          <button onClick={refreshCounts} className="btn btn-outline mt-3">
            {t("common.refresh")}
          </button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredCounts.length === 0 ? (
        <div className="card text-center py-12">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">
            {t(
              counts.length
                ? "inventoryCountWorkspace.emptyStatus"
                : "inventory.noCounts",
            )}
          </p>
          {canCreate && counts.length === 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary mt-4"
            >
              {t("inventory.createFirst")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCounts.map((count) => (
            <button
              type="button"
              key={count.id}
              className="card w-full text-left hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                openCount(count.id);
              }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={`p-3 rounded-xl ${
                      count.status === "completed"
                        ? "bg-green-100 text-green-600"
                        : ["in_progress", "pending_review"].includes(
                              count.status,
                            )
                          ? "bg-orange-100 text-orange-600"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count.status === "completed" ? (
                      <Check size={24} />
                    ) : ["in_progress", "pending_review"].includes(
                        count.status,
                      ) ? (
                      <Clock size={24} />
                    ) : (
                      <X size={24} />
                    )}
                  </div>
                  <div>
                    <div className="font-medium">
                      {getPeriodLabel(count.period)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(count.startDate).toLocaleDateString()} -{" "}
                      {new Date(count.endDate).toLocaleDateString()}
                    </div>
                    {count.notes && (
                      <div className="text-sm text-gray-400 mt-1">
                        {count.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(count.status)}
                  <span className="text-sm text-gray-400">
                    {count.items?.length || 0} {t("inventory.items")}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Detail View
  const renderDetailView = () => {
    if (!selectedCount) return null;

    const varianceItems =
      selectedCount.items?.filter(
        (i) => typeof i.variance === "number" && i.variance !== 0,
      ) || [];
    const countedItems =
      selectedCount.items?.filter(
        (i) => i.countedQty !== undefined && i.countedQty !== null,
      ) || [];

    const busy =
      updateItemMutation.isPending ||
      submitMutation.isPending ||
      completeMutation.isPending ||
      cancelMutation.isPending;
    const allCounted =
      countedItems.length === selectedCount.items.length &&
      countedItems.length > 0;
    const reasonsPresent = varianceItems.every((item) => !!item.note?.trim());

    return (
      <div className="space-y-6">
        <PageHelp>{t("countFlow.hint")}</PageHelp>
        <button onClick={refreshCounts}>{t("countFlow.refresh")}</button>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <button
              onClick={showList}
              className="text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              ← {t("common.back")}
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {getPeriodLabel(selectedCount.period)}
            </h1>
            <div className="flex items-center gap-4 mt-2">
              {getStatusBadge(selectedCount.status)}
              <span className="text-sm text-gray-500">
                {countedItems.length} / {selectedCount.items?.length || 0}{" "}
                {t("inventory.counted")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {canSubmit &&
              ["in_progress", "pending_review"].includes(
                selectedCount.status,
              ) && (
                <>
                  {canApprove && (
                    <button
                      onClick={() => cancelMutation.mutate(selectedCount.id)}
                      disabled={busy}
                      className="btn btn-outline flex items-center gap-2"
                    >
                      <X size={16} />
                      {t("inventory.cancelCount")}
                    </button>
                  )}
                  {canSubmit && selectedCount.status === "in_progress" && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || !allCounted || !reasonsPresent}
                      onClick={() => submitMutation.mutate(selectedCount.id)}
                    >
                      {t("inventoryCountWorkspace.submitReview")}
                    </button>
                  )}
                  {canApprove && selectedCount.status === "pending_review" && (
                    <button
                      onClick={handleComplete}
                      disabled={busy || !allCounted || !reasonsPresent}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      {completeMutation.isPending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {t("inventoryFlow.approveCount")}
                    </button>
                  )}
                </>
              )}
          </div>
        </div>

        {selectedCount.status === "completed" && (
          <div
            className="card border-green-200 bg-green-50"
            data-testid="count-adjustment-result"
          >
            <h2 className="font-semibold">
              {t("inventoryCountWorkspace.adjustmentResult")}
            </h2>
            <p className="text-sm mt-2">
              {t("inventoryCountWorkspace.appliedHint")}
            </p>
            {selectedCount.updatedAt && (
              <p className="text-sm mt-2">
                {t("inventoryCountWorkspace.appliedAt")}:{" "}
                {formatDateTime(selectedCount.updatedAt)}
              </p>
            )}
          </div>
        )}

        {/* Summary Cards */}
        {["in_progress", "pending_review"].includes(selectedCount.status) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card bg-green-50 border-green-200">
              <div className="text-2xl font-bold text-green-600">
                {countedItems.length}
              </div>
              <div className="text-sm text-gray-500">
                {t("inventory.counted")}
              </div>
            </div>
            <div className="card bg-red-50 border-red-200">
              <div className="text-2xl font-bold text-red-600">
                {(selectedCount.items?.length || 0) - countedItems.length}
              </div>
              <div className="text-sm text-gray-500">
                {t("inventory.pending")}
              </div>
            </div>
            <div className="card bg-orange-50 border-orange-200">
              <div className="text-2xl font-bold text-orange-600">
                {varianceItems.length}
              </div>
              <div className="text-sm text-gray-500">
                {t("inventory.hasVariance")}
              </div>
            </div>
          </div>
        )}

        {/* Variance Alert */}
        {varianceItems.length > 0 && (
          <div className="card bg-orange-50 border-orange-200">
            <div className="flex items-center gap-2 text-orange-700 font-medium mb-3">
              <AlertTriangle size={20} />
              {t("inventory.varianceItems")}
            </div>
            <div className="space-y-2">
              {varianceItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-lg"
                >
                  <div>
                    <span className="font-medium">
                      {formatItemName(
                        item.inventory?.name || "Unknown",
                        i18n.language,
                      )}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({item.inventory?.unit})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {t("inventory.system")}: {item.systemQty}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t("inventory.actual")}: {item.countedQty}
                    </span>
                    <span
                      className={`font-bold ${item.variance! > 0 ? "text-red-600" : "text-blue-600"}`}
                    >
                      {item.variance! > 0 ? "+" : ""}
                      {item.variance}
                    </span>
                  </div>
                </div>
              ))}
              {varianceItems.length > 5 && (
                <div className="text-center text-sm text-gray-500">
                  {t("inventory.andMore")} {varianceItems.length - 5}{" "}
                  {t("inventory.itemsVariance")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="card">
          <h3 className="font-medium mb-4">
            {t(
              selectedCount.status === "completed"
                ? "inventoryCountWorkspace.itemsAndAdjustments"
                : "inventory.countItems",
            )}
          </h3>
          <div className="overflow-x-auto">
            <table className="inventory-responsive-table w-full md:min-w-[860px]">
              <thead className="whitespace-nowrap">
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3">{t("inventory.material")}</th>
                  <th className="pb-3 text-right">{t("countFlow.theory")}</th>
                  <th className="pb-3 text-right">
                    {t("inventory.actualQty")}
                  </th>
                  <th className="pb-3 text-right">
                    {t(
                      selectedCount.status === "completed"
                        ? "inventoryCountWorkspace.appliedDelta"
                        : "inventory.varianceCol",
                    )}
                  </th>
                  <th>{t("countFlow.movement")}</th>
                  {canReadCost && <th>{t("countFlow.amount")}</th>}
                  <th>{t("countFlow.reason")}</th>
                  {canEdit && selectedCount.status === "in_progress" && (
                    <th className="pb-3 text-center">
                      {t("inventory.action")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {selectedCount.items?.map((item) => {
                  const variance =
                    item.countedQty !== undefined && item.countedQty !== null
                      ? item.countedQty - item.systemQty
                      : null;

                  return (
                    <tr
                      key={item.id}
                      id={"count-item-" + item.id}
                      className={`border-b last:border-0 ${searchParams.get("itemId") === item.id ? "bg-blue-50" : ""}`}
                    >
                      <td data-label={t("inventory.material")} className="py-3">
                        <span className="font-medium">
                          {formatItemName(
                            item.inventory?.name || "Unknown",
                            i18n.language,
                          )}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({item.inventory?.unit})
                        </span>
                      </td>
                      <td
                        data-label={t("countFlow.theory")}
                        className="py-3 text-right text-gray-600"
                      >
                        {item.countedAt
                          ? item.systemQty
                          : item.inventory?.currentStock}
                      </td>
                      <td
                        data-label={t("inventory.actualQty")}
                        className="py-3 text-right"
                      >
                        {item.countedQty !== undefined &&
                        item.countedQty !== null ? (
                          <span
                            className={
                              variance !== 0 && variance !== null
                                ? "font-bold text-orange-600"
                                : ""
                            }
                          >
                            {item.countedQty}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td
                        data-label={t(
                          selectedCount.status === "completed"
                            ? "inventoryCountWorkspace.appliedDelta"
                            : "inventory.varianceCol",
                        )}
                        className="py-3 text-right"
                      >
                        {variance !== null ? (
                          <span
                            className={`font-medium ${variance > 0 ? "text-red-600" : variance < 0 ? "text-blue-600" : "text-gray-600"}`}
                          >
                            {variance > 0 ? "+" : ""}
                            {variance}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td data-label={t("countFlow.movement")}>
                        {item.movementSinceObservation ?? "—"}
                      </td>
                      {canReadCost && (
                        <td data-label={t("countFlow.amount")}>
                          {item.varianceAmountEstimate ?? "—"}
                        </td>
                      )}
                      <td data-label={t("countFlow.reason")}>
                        {item.note || "—"}
                      </td>
                      {canEdit && selectedCount.status === "in_progress" && (
                        <td
                          data-label={t("inventory.action")}
                          className="py-3 text-center"
                        >
                          <CountItemInput
                            item={item}
                            key={item.id + item.inventory?.updatedAt}
                            onUpdate={(qty, note) =>
                              handleUpdateItem(item, qty, note)
                            }
                            isUpdating={updateItemMutation.isPending}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Create Modal
  const renderCreateModal = () => (
    <div className="fixed inset-0 bg-black/50 pointer-events-none flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl p-6 w-full max-w-md pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{t("inventory.newCount")}</h2>

        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">{t("inventory.period")}</label>
            <select
              value={newCountForm.period}
              onChange={(e) =>
                setNewCountForm({
                  ...newCountForm,
                  period: e.target.value as any,
                })
              }
              className="input w-full"
            >
              <option value="ad_hoc">{t("inventoryFlow.adHoc")}</option>
              <option value="monthly">{t("inventory.monthly")}</option>
              <option value="quarterly">{t("inventory.quarterly")}</option>
              <option value="annual">{t("inventory.annual")}</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">{t("inventory.startDate")}</label>
              <input
                type="date"
                value={newCountForm.startDate}
                onChange={(e) =>
                  setNewCountForm({
                    ...newCountForm,
                    startDate: e.target.value,
                  })
                }
                className="input w-full"
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t("inventory.endDate")}</label>
              <input
                type="date"
                value={newCountForm.endDate}
                onChange={(e) =>
                  setNewCountForm({ ...newCountForm, endDate: e.target.value })
                }
                className="input w-full"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t("inventory.notes")}</label>
            <textarea
              value={newCountForm.notes}
              onChange={(e) =>
                setNewCountForm({ ...newCountForm, notes: e.target.value })
              }
              className="input w-full"
              rows={3}
              placeholder={t("inventory.notesPlaceholder")}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setShowCreateModal(false)}
            className="btn btn-outline flex-1"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleCreateCount}
            disabled={
              createMutation.isPending ||
              !newCountForm.startDate ||
              !newCountForm.endDate ||
              newCountForm.startDate > newCountForm.endDate
            }
            className="btn btn-primary flex-1"
          >
            {createMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {t("inventory.create")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {!countId && renderListView()}
      {countId && detailQuery.isLoading && (
        <div className="py-12 flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {countId && detailQuery.isError && (
        <div className="card">
          <p>{t("inventoryCountWorkspace.unavailable")}</p>
          <button className="btn btn-outline mt-3" onClick={showList}>
            {t("common.back")}
          </button>
        </div>
      )}
      {countId && !detailQuery.isError && selectedCount && renderDetailView()}
      {showCreateModal && renderCreateModal()}
    </div>
  );
}

// Count Item Input Component
function CountItemInput({
  item,
  onUpdate,
  isUpdating,
}: {
  item: InventoryCountItem;
  onUpdate: (qty: number, note: string) => void;
  isUpdating: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(item.countedQty?.toString() || "");
  const [reason, setReason] = useState(item.note || "");
  const [showInput, setShowInput] = useState(
    item.countedQty === null || item.countedQty === undefined,
  );

  const handleSubmit = () => {
    const qty = parseFloat(value);
    if (Number.isFinite(qty) && qty >= 0) {
      onUpdate(qty, reason);
      setShowInput(false);
    }
  };

  if (showInput || item.countedQty === undefined || item.countedQty === null) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          aria-label={t("inventory.actualQty")}
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="input input-sm w-20"
          min={0}
          placeholder="0"
          disabled={isUpdating}
        />
        <input
          aria-label={t("countFlow.reason")}
          className="input input-sm w-32"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("countFlow.reason")}
          disabled={isUpdating}
        />
        <button
          onClick={handleSubmit}
          aria-label={t("common.save")}
          disabled={isUpdating}
          className="btn btn-sm btn-primary"
        >
          <Check size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{item.countedQty}</span>
      <button
        onClick={() => setShowInput(true)}
        className="btn btn-sm btn-ghost"
        title={t("inventory.editItem")}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
