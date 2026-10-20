import { InventoryCountProgress } from '../../../../shared/components/InventoryCountProgress'
import { countProgress, isCounted, hasCountVariance, matchesCountFilter, CountItemFilter } from '../../../../shared/inventoryCountProgress'
import {consumptionQuantity} from '../../utils/consumptionQuantity'
import { InventoryCountEditor } from '../../../../shared/components/InventoryCountEditor'
import { inventoryCountLabels } from '../../../../shared/inventoryCountLabels'
import { notifyAdmin, confirmAdmin } from '../../components/AdminFeedback'
import { AdminDialog } from '../../components/AdminDialog'
import dateLocaleI18n from '../../i18n'
import { LocalizedDateTimeInput } from '../../components/LocalizedDateTimeInput'
import { ActorName, CountOperators, InventoryActor } from '../../components/InventoryActor';
import { inventoryInputUnits, inventoryUnitFactor, inventoryLedgerQuantity } from "../../utils/inventoryInputUnits";
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
import { formatItemName, formatDateTime, formatCurrency } from "../../utils/helpers";
import {
  Loader2,
  Plus,
  Package,
  Check,
  X,
  Clock,
  AlertTriangle,
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
  countedByActor?: InventoryActor | null;
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
  const formatNumber=(value:unknown)=>consumptionQuantity(value,i18n.language);
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
  const [draftDirty,setDraftDirty] = useState(false);
  const [itemFilter,setItemFilter] = useState<CountItemFilter>('all');
  const [itemSearch,setItemSearch] = useState('');
  const [reviewSubmit,setReviewSubmit] = useState(false);
  useEffect(()=>{setItemFilter('all');setItemSearch('');setReviewSubmit(false)},[countId]);
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
    notifyAdmin(error?.response?.data?.message || t("countFlow.refresh"));
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

  const handleComplete = async () => {
    if (
      !selectedCount ||
      !canApprove ||
      selectedCount.status !== "pending_review"
    )
      return;
    if (!await confirmAdmin(t("inventory.confirmCompleteCount"))) return;
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
              key={count.id} data-notice-object={count.id}
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
                      {new Date(count.startDate).toLocaleDateString(dateLocaleI18n.language)} -{" "}
                      {new Date(count.endDate).toLocaleDateString(dateLocaleI18n.language)}
                    </div>
                    <CountOperators items={count.items || []}/>
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
              <div className="mt-3"><InventoryCountProgress items={count.items||[]} language={i18n.language} compact/></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Detail View
  const renderDetailView = () => {
    if (!selectedCount) return null;

    const varianceItems = selectedCount.items.filter(hasCountVariance);
    const countedItems = selectedCount.items.filter(isCounted);
    const labels = inventoryCountLabels(i18n.language);
    const totals = countProgress(selectedCount.items);
    const pendingItems = selectedCount.items.filter(item=>!isCounted(item));
    const savedVisible = selectedCount.items.filter(item=>matchesCountFilter(item,itemFilter)&&[item.inventory?.name,formatItemName(item.inventory?.name||'',i18n.language)].join(' ').toLocaleLowerCase().includes(itemSearch.toLocaleLowerCase().trim()));

    const busy =
      submitMutation.isPending ||
      completeMutation.isPending ||
      cancelMutation.isPending;
    const hasCountedItems =
      countedItems.length > 0;

    return (
      <div className="space-y-6" data-notice-object={selectedCount.id}>
        <PageHelp>{inventoryCountLabels(i18n.language).hint}</PageHelp><p className="text-sm text-amber-800">{t("inventoryUnified.count")}</p>
        <button disabled={draftDirty || busy} onClick={refreshCounts}>{t("countFlow.refresh")}</button>
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <button
              onClick={showList}
              disabled={draftDirty || busy}
              className="text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              ← {t("common.back")}
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              {getPeriodLabel(selectedCount.period)}
            </h1>
            <CountOperators items={selectedCount.items || []}/>
            <div className="flex items-center gap-4 mt-2">
              {getStatusBadge(selectedCount.status)}
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
                      disabled={busy || draftDirty}
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
                      disabled={busy || !hasCountedItems || draftDirty}
                      onClick={() => setReviewSubmit(true)}
                    >
                      {t("inventoryCountWorkspace.submitReview")}
                    </button>
                  )}
                  {canApprove && selectedCount.status === "pending_review" && (
                    <button
                      onClick={handleComplete}
                      disabled={busy || !hasCountedItems || draftDirty}
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

        <InventoryCountProgress items={selectedCount.items} language={i18n.language}/>

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

        {canEdit && selectedCount.status==='in_progress' && <InventoryCountEditor hideProgress formatQuantity={formatNumber} key={selectedCount.id} items={selectedCount.items} language={i18n.language} name={formatItemName} units={inventoryInputUnits} factor={inventoryUnitFactor} ledger={inventoryLedgerQuantity} onDirtyChange={setDraftDirty} onSave={async changes=>{await inventoryApi.updateInventoryCountItems(selectedCount.id,changes);await detailQuery.refetch();refreshCounts();}} onReload={async()=>{const response=await detailQuery.refetch();if(response.error)throw response.error;return response.data?.data?.data?.items||[];}}/>}
        {pendingItems.length>0&&<details className="card space-y-3" data-testid="count-uncounted-items"><summary className="font-semibold cursor-pointer">{labels.pending} · {pendingItems.length}</summary><p className="text-sm text-gray-500">{labels.uncountedHint}</p><ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">{pendingItems.map(item=><li key={item.id} className="rounded-lg bg-gray-50 p-3 break-words">{formatItemName(item.inventory?.name || "Unknown",i18n.language)}</li>)}</ul></details>}
        {reviewSubmit&&<AdminDialog title={labels.reviewSubmit} onClose={()=>setReviewSubmit(false)} className="max-w-lg" busy={submitMutation.isPending} chrome><p className="text-sm">{labels.counted}: {totals.counted} / {totals.total} · {labels.pending}: {totals.pending}</p><p className="text-sm text-gray-600 mt-2">{labels.partialHint}</p><ul className="max-h-60 overflow-auto list-disc pl-5 my-3">{pendingItems.map(item=><li key={item.id}>{formatItemName(item.inventory?.name||'',i18n.language)}</li>)}</ul><div className="flex flex-wrap gap-2"><button className="btn btn-outline" onClick={()=>{setReviewSubmit(false);document.getElementById('count-batch-editor')?.scrollIntoView({block:'start'})}}>{labels.continueCount}</button><button className="btn btn-primary" disabled={busy||draftDirty} onClick={()=>{submitMutation.mutate(selectedCount.id);setReviewSubmit(false)}}>{labels.confirmPartial}</button></div></AdminDialog>}

        {/* Variance Alert */}
        {varianceItems.length > 0 && (
          <details className="card bg-orange-50 border-orange-200">
            <summary className="flex items-center gap-2 text-orange-700 font-medium cursor-pointer">
              <AlertTriangle size={20} />
              {t("inventory.varianceItems")} · {varianceItems.length}
            </summary>
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
                      {t("inventory.system")}: {formatNumber(item.systemQty)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {t("inventory.actual")}: {formatNumber(item.countedQty)}
                    </span>
                    <span
                      className={`font-bold ${item.variance! > 0 ? "text-red-600" : "text-blue-600"}`}
                    >
                      {item.variance! > 0 ? "+" : ""}
                      {formatNumber(item.variance)}
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
          </details>
        )}


        {/* Saved observation details retain operators, movement, valuation and adjustment history. */}
        <details className="card" open={selectedCount.status!=="in_progress"}>
          <summary className="font-medium mb-4 cursor-pointer">
            {t(
              selectedCount.status === "completed"
                ? "inventoryCountWorkspace.itemsAndAdjustments"
                : "inventory.countItems",
            )}
          </summary>
          <div className="space-y-3 mb-3"><input aria-label={labels.search} placeholder={labels.search} value={itemSearch} onChange={e=>setItemSearch(e.target.value)} className="input w-full"/><div className="flex flex-wrap gap-2" role="group" aria-label={labels.batchProgress}>{(['all','pending','counted','difference'] as const).map(key=><button key={key} type="button" aria-pressed={itemFilter===key} onClick={()=>setItemFilter(key)} className={`border rounded-lg px-3 py-2 text-sm ${itemFilter===key?'bg-primary-light border-primary':'bg-white border-gray-200'}`}>{labels[key]} {key==='all'?totals.total:totals[key]}</button>)}</div>{!savedVisible.length&&<p className="text-gray-500">{labels.empty}</p>}</div>
          <div className="overflow-x-auto">
            <table className="inventory-responsive-table count-results-table w-full">
              <thead>
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
                  <th>{t("operations.details")}</th>

                </tr>
              </thead>
              <tbody>
                {savedVisible.map((item) => {
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
                      <td data-label={t("inventory.material")} className="py-3 count-material">
                        <div className="min-w-0"><span className="font-medium">
                          {formatItemName(
                            item.inventory?.name || "Unknown",
                            i18n.language,
                          )}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({item.inventory?.unit})
                        </span>
                        <p className={`text-xs mt-1 ${isCounted(item)?'text-green-700':'text-amber-800'}`}>{isCounted(item)?'✓ '+labels.counted:labels.pending}</p>
                        </div>
                      </td>
                      <td
                        data-label={t("countFlow.theory")}
                        className="py-3 text-right text-gray-600"
                      >
                        {formatNumber(item.countedAt
                          ? item.systemQty
                          : item.inventory?.currentStock)}
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
                            {formatNumber(item.countedQty)}
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
                            {formatNumber(variance)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td data-label={t("operations.details")} className="count-audit">
                        <details>
                          <summary className="cursor-pointer text-primary-hover text-sm">{t("operations.details")}</summary>
                          <dl className="mt-2 space-y-2 text-xs text-gray-600">
                            {item.countedAt && <div><dt>{t('inventoryActors.counter')}</dt><dd><ActorName actor={item.countedByActor} id={item.countedBy}/> · {formatDateTime(item.countedAt)}</dd></div>}
                            <div><dt>{t("countFlow.movement")}</dt><dd>{formatNumber(item.movementSinceObservation)}</dd></div>
                            {canReadCost && <div><dt>{t("countFlow.amount")}</dt><dd>{item.varianceAmountEstimate == null ? '—' : formatCurrency(item.varianceAmountEstimate)}</dd></div>}
                            {item.note && <div><dt>{t("countFlow.reason")}</dt><dd>{item.note}</dd></div>}
                          </dl>
                        </details>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    );
  };

  // Create Modal
  const renderCreateModal = () => (
    <AdminDialog title={t("inventory.newCount")} onClose={() => setShowCreateModal(false)} className="max-w-md" busy={Boolean(createMutation.isPending)} trackChanges chrome>


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
              <LocalizedDateTimeInput
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
              <LocalizedDateTimeInput
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

        <div className="admin-dialog-footer flex gap-3 mt-6">
          <button
            onClick={() => setShowCreateModal(false)}
            className="btn btn-outline flex-1"
           data-dialog-close="true">
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
      </AdminDialog>
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
