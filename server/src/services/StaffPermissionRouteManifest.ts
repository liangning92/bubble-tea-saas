// Explicit route declarations. Regenerate and review when adding business routes.
export const ACCESS_ROUTE_MANIFEST:Record<string,{permission:string|null;ownerOnly:boolean;export:boolean;personal:boolean;legacyRoles?:string[];legacyPermission?:string|null;resource?:{model:string;param:string}|null;publicationAudience?:{allStaff?:boolean;staffField?:string;resourceModel?:string;resourceParam?:string}}> = {
  "GET /api/team/agent-work-guides":{permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/agent-jobs":{permission:"team.audit",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager"],legacyPermission:"team.audit"},
  "GET /api/team/agent-jobs/:id":{permission:"team.audit",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager"],legacyPermission:"team.audit"},
  "POST /api/team/channels/:id/agent-continuations": {permission:"team.manage",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager"],legacyPermission:"team.manage"},
  "POST /api/marketing/activities/:id/poster-preview": {permission:"marketing.read",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager"],legacyPermission:"marketing.read"},
  "POST /api/purchase-orders/:id/confirm-payment": {permission:"finance.write",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager"],legacyPermission:"purchases.write",resource:{model:"purchaseOrder",param:"id"}},
  "GET /api/team/ai/operations-delegations": {permission:null,ownerOnly:true,export:false,personal:false},
  "POST /api/team/ai/operations-delegations": {permission:null,ownerOnly:true,export:false,personal:false},
  "POST /api/team/ai/operations-delegations/:id/revoke": {permission:null,ownerOnly:true,export:false,personal:false},
  "GET /api/inventory/evidence-export": {permission:"inventory.read",ownerOnly:false,export:true,personal:false,legacyRoles:["admin"],legacyPermission:"inventory.read"},
  "GET /api/staff-work/my/push-device/config": {permission:"personal.profile",ownerOnly:false,export:false,personal:true},
  "POST /api/staff-work/my/push-device/check": {permission:"personal.profile",ownerOnly:false,export:false,personal:true},
  "POST /api/staff-work/my/push-device/test": {permission:"personal.profile",ownerOnly:false,export:false,personal:true},
  "POST /api/staff-work/my/push-device/tests/:id/receipt": {permission:"personal.profile",ownerOnly:false,export:false,personal:true},
  "GET /api/staff-work/my/inbox": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/staff-work/my/inbox/:id/read": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels/:id/management/actions": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/team/channels/:id/management/actions/:actionId/actions": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/workflow/defaults": {permission:null,ownerOnly:true,export:false,personal:false},
  "PUT /api/team/workflow/defaults": {permission:null,ownerOnly:true,export:false,personal:false},
  "GET /api/team/channels/:id/workflow/policy": {permission:null,ownerOnly:false,export:false,personal:false},
  "PUT /api/team/channels/:id/workflow/policy": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/workflow/jobs": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/workflow/events": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/channels/:id/workflow/jobs/:seq/actions": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/workflow/export": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/inventory/manual-logs/:type/:id/corrections": {permission:null,ownerOnly:true,export:false,personal:false},
  "POST /api/inventory/manual-logs/:type/:id/corrections": {permission:null,ownerOnly:true,export:false,personal:false},
  "GET /api/team/ai/settings": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/operations": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/channels/:id/operations/import": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/channels/:id/operations/:planId/actions": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/channels/:id/operations/:planId/scan": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/operations/:planId/export": {permission:null,ownerOnly:false,export:false,personal:false},
  "PUT /api/team/ai/settings": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/ai/connection-check": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/ai/agent-settings": {permission:null,ownerOnly:false,export:false,personal:false},
  "PUT /api/team/ai/agent-settings": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/ai/agent-check": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/channels/:id/ai/drafts": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/ai/drafts/:draftId": {permission:null,ownerOnly:false,export:false,personal:false},
  "POST /api/team/channels/:id/ai/drafts/:draftId/publish": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/channels/:id/tasks": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/team/channels/:id/tasks": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/team/channels/:id/tasks/:taskId/actions": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/directory": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/capabilities": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/team/channels": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels/:id/messages": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/team/channels/:id/messages": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "PUT /api/team/channels/:id/members": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "PUT /api/team/channels/:id/read": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels/:id/receipts": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "POST /api/team/channels/:id/rounds/:action": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels/:id/minutes": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "PUT /api/team/channels/:id/minutes/:roundId": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels/:id/minutes/:roundId/versions": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/channels/:id/files/:fileId": {permission:"personal.messages",ownerOnly:false,export:false,personal:true},
  "GET /api/team/admin/audits": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/team/admin/channels": {permission:null,ownerOnly:false,export:false,personal:false},
  "GET /api/auth/employee-offline-attendance": {permission:"personal.attendance",ownerOnly:false,export:false,personal:true},
  "POST /api/auth/employee-offline-attendance/sync": {permission:"personal.attendance",ownerOnly:false,export:false,personal:true},
  "POST /api/attendance-qr/offline-prepare": {permission:"pos.shift",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager","cashier"]},
  "POST /api/auth/register": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/auth/login": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/auth/me": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/auth/password": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/queue": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/queue": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.status",
    "resource": null,
    "permission": "orders.status",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/queue/call-next": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.status",
    "resource": null,
    "permission": "orders.status",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/queue/:id/status": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.status",
    "resource": null,
    "permission": "orders.status",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/import": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/stores": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/stores/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/categories": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/categories": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/categories/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/categories/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/products": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/products/pos": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/products/pos/version": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/products/barcode/:barcode": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/products/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/products/:id/cost": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.read",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/products": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/products/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/products/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "products.write",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/products/:id/status": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/products/:id/restore": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "products.write",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/products/batch-status": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/products/recalculate-costs": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/products/:id/bom": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": {
      "model": "product",
      "param": "id"
    },
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/orders": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/orders/export-data": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": true,
    "personal": false
  },
  "GET /api/orders/refund-requests": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.refund",
    "resource": null,
    "permission": "orders.refund.approve",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/orders/:id/refund-quote": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.refund",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "orders.refund.request",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/received-receipts": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/orders/received-receipts": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/orders/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "orders.create",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/bulk-sync": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "orders.create",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/refund-request": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.refund",
    "resource": null,
    "permission": "orders.refund.request",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/orders/kds/:id/status": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "orders.status",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "production.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/orders/:id/status": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.status",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "orders.status",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/orders/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.cancel",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "orders.cancel",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/:id/void": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.create",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "orders.refund.approve",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/:id/refund": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.refund",
    "resource": {
      "model": "order",
      "param": "id"
    },
    "permission": "orders.refund",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/refund-requests/:id/approve": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.refund",
    "resource": null,
    "permission": "orders.refund.approve",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/orders/refund-requests/:id/reject": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "orders.refund",
    "resource": null,
    "permission": "orders.refund.approve",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/orders/kds/list": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "production.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/logs/stock-out/:logId/photos/:fileId": {permission:'inventory.read',legacyPermission:'inventory.read',legacyRoles:['manager','cashier','staff'],ownerOnly:false,export:false,personal:false,resource:null},
  "GET /api/team/ai/agent-memory": {permission:null,ownerOnly:true,export:false,personal:false},
  "GET /api/team/ai/agent-memory/:id/history": {permission:null,ownerOnly:true,export:false,personal:false},
  "PUT /api/team/ai/agent-memory/:id": {permission:null,ownerOnly:true,export:false,personal:false},
  "GET /api/inventory/operation-records": {permission:"inventory.read",legacyPermission:"inventory.read",legacyRoles:["manager","cashier","staff"],ownerOnly:false,export:false,personal:false,resource:null},
  "GET /api/inventory/logs": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory/stock-in": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "inventory.stockIn",
    "resource": null,
    "permission": "inventory.stockIn",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory/stock-out": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "inventory.stockOut",
    "resource": null,
    "permission": "inventory.stockOut",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/inventory/:id/adjust": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": {
      "model": "inventory",
      "param": "id"
    },
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/alerts/low-stock": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/stats/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/logs/stock-in": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/logs/stock-out": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/logs/today-stock-out": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/inventory/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "inventory.write",
    "resource": {
      "model": "inventory",
      "param": "id"
    },
    "permission": "inventory.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/batches": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/batches/expiring": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/alert-center": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory/alert-center/:id/handle": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/inventory/alert-center/expiry": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/employee-consumption": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/recipe-usage": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/consumption-alerts": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/consumption-analysis": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/anomaly-summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/alert-config": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/inventory/alert-config": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/inventory/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": {
      "model": "inventory",
      "param": "id"
    },
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": {
      "model": "inventory",
      "param": "id"
    },
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff/payroll-rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "salary.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff/payroll-rules": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "staff.write",
    "resource": null,
    "permission": "salary.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/staff/probation-rule": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.read",
    "resource": null,
    "permission": "salary.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff/probation-rule": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "salary.write",
    "resource": null,
    "permission": "salary.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/staff/salary/my/probation": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.salary",
    "resource": null,
    "permission": "personal.salary",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": {
      "model": "staff",
      "param": "id"
    },
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": null,
    "permission": "staff.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.write",
    "resource": {
      "model": "staff",
      "param": "id"
    },
    "permission": "staff.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff/:id/role": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": {
      "model": "staff",
      "param": "id"
    },
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/staff/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "staff.write",
    "resource": {
      "model": "staff",
      "param": "id"
    },
    "permission": "staff.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/staff/attendance": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff/attendance/today": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff/attendance/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff/attendance/list": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff/schedule": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff/schedule/list": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "schedules.read",
    "resource": null,
    "permission": "schedules.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff/schedule/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": null,
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff/attendance/history": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff/overview/monthly": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff/salary/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.salary",
    "resource": null,
    "permission": "personal.salary",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff/:id/reset-password": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": {
      "model": "staff",
      "param": "id"
    },
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/members/offline-snapshot": {
    "legacyRoles": [
      "manager",
      "cashier"
    ],
    "legacyPermission": "members.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/members": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/members/barcode/:barcode": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/members/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.read",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/members/phone/:phone": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/members": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.write",
    "resource": null,
    "permission": "members.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/members/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "members.write",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/members/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "members.write",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/members/:id/redeem": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.write",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/members/:id/points-history": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.read",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/members/:id/adjust-points": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "members.write",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/members/stats/summary": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "members.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/config": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/config/staff/features": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/config/staff/features": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/config/:storeId/:key": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/config/hardware-settings": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/config": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/config/batch": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/config/:storeId/:key": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/config/defaults/:category": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/receipt-templates": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/receipt-templates/default": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/receipt-templates/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/receipt-templates": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/receipt-templates/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/receipt-templates/:id/set-default": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/receipt-templates/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/receipt-templates/seed": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/pos-action-logs": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/pos-action-logs": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/pos-action-logs/stats": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/pos-action-logs/sessions": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/reports/revenue": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/daily": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/hourly": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/inventory": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/staff": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/pending-actions": {permission:"dashboard.read",ownerOnly:false,export:false,personal:false,legacyRoles:["admin","manager"],legacyPermission:"dashboard.read",resource:null},
  "GET /api/reports/dashboard": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/channels": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/channels/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reports/commissions": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/suppliers": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "purchases.read",
    "resource": null,
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/suppliers/dropdown": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "purchases.read",
    "resource": null,
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/suppliers/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "purchases.read",
    "resource": {
      "model": "supplier",
      "param": "id"
    },
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/suppliers/:id/stats": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.read",
    "resource": {
      "model": "supplier",
      "param": "id"
    },
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/suppliers": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": null,
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/suppliers/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "supplier",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/suppliers/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "supplier",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/purchase-orders": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.read",
    "resource": null,
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/purchase-orders/pending": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.read",
    "resource": null,
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/purchase-orders/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.read",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "purchases.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/purchase-orders": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": null,
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/purchase-orders/:id/status": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/purchase-orders/:id/receive": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/purchase-orders/:id": {
    "legacyRoles": [
      "admin", "manager", "staff"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/performance": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/offline-snapshot": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/display": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/resources": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/claim": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "members.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/referral": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "members.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/quote": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/migration/preview": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/migration/apply": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/activities/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/activities/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/entitlements/list": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/entitlements/:id/fulfil": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/groups/list": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/groups": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/groups/:id/join": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/activities/heartbeat": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activities/terminals/list": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/campaigns/:id/stats": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/campaigns": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/campaigns": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/campaigns/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/campaigns/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/campaigns/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/coupons": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/coupons": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/coupons/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/coupons/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/coupons/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/coupons/verify": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/members/:memberId/coupons": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/coupons/:couponId/generate/:memberId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/coupons/:memberCouponId/redeem": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation/run": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation/birthday": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation/reactivation": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation/points-expiring": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation/seasonal": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation/run/:campaignId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/automation/time": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/automation/time": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/members/search": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/members/:id/balance": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/members/:id/balance/topup": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.balance",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/members/:id/balance/deduct": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": {
      "model": "member",
      "param": "id"
    },
    "permission": "members.balance",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/balance-logs": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/discount-rules": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/discount-rules": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/discount-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/discount-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/activity-prices": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/timed-specials": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/timed-specials": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/timed-specials/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/timed-specials/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/stacking-rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/stacking-rules": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/stacking-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/stacking-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/automation-rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/automation-rules": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/automation-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/automation-rules/:id/status": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/automation-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/automation-logs": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/message-stats": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/coupon-reports": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/campaign-reports": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/referral-funnel": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/finance/shift-sessions/:id/cash-warning/review": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/finance/shift-sessions/:id/correction": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/shift-sessions": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/revenue": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/revenue/daily": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/revenue/hourly": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/profit": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/income-statement": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/balance-sheet": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/tax": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/cash-flow": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/goal": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/product-mix": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/abc-analysis": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/accounts/types": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/finance/accounts/types": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/accounts": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/finance/accounts/seed": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/accounts/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/finance/accounts": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/finance/accounts/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/finance/accounts/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/finance/accounts/transfer": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/accounts/transfers/list": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/assets": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/assets/schedule": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/assets/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": {
      "model": "fixedAsset",
      "param": "id"
    },
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/finance/assets": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/finance/assets/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": {
      "model": "fixedAsset",
      "param": "id"
    },
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/finance/assets/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": {
      "model": "fixedAsset",
      "param": "id"
    },
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/finance/assets/:id/dispose": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": {
      "model": "fixedAsset",
      "param": "id"
    },
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/budgets/categories": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/finance/budgets/categories": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/budgets": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/finance/budgets/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/finance/budgets": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/finance/budgets/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/finance/budgets/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/finance/reports/download": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": true,
    "personal": false
  },
  "GET /api/finance/reports/tax/download": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": true,
    "export": true,
    "personal": false
  },
  "GET /api/staff-management/performance": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/attendance-analytics": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/schedule-coverage": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/payroll": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/kpi": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/turnover": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/sales-stats": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-management/training": {
    publicationAudience:{staffField:'staffId'},
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.write",
    "resource": null,
    "permission": "staff.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-management/training/:id": {
    publicationAudience:{staffField:'staffId',resourceModel:'training',resourceParam:'id'},
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.write",
    "resource": null,
    "permission": "staff.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/training/all": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.read",
    "resource": null,
    "permission": "staff.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-management/training/:staffId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "DELETE /api/staff-management/training/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "staff.write",
    "resource": null,
    "permission": "staff.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-salary/calculate/:staffId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.read",
    "resource": null,
    "permission": "salary.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-points/balance/:staffId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-points/store/:storeId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "rewards.read",
    "resource": null,
    "permission": "rewards.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-points/history/:staffId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-points/earn": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-points/redeem": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-points/adjust": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-points/process-expiry": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-points/rewards": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "rewards.read",
    "resource": null,
    "permission": "rewards.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-points/rewards": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-points/rewards/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/staff-points/rewards/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-points/redemption": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-points/redemption/pending": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.read",
    "resource": null,
    "permission": "rewards.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-points/redemption/:id/fulfill": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/staff-points/redemption/:id/cancel": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/staff-points/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-points/logs/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-points/rewards/available": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-points/rules": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff-points/rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/deposit/rules": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.salary",
    "resource": null,
    "permission": "personal.salary",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/deposit/rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.write",
    "resource": null,
    "permission": "deposits.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/deposit/rules/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.write",
    "resource": null,
    "permission": "deposits.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/deposit/rules/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.write",
    "resource": null,
    "permission": "deposits.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/deposit/staff/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.salary",
    "resource": null,
    "permission": "personal.salary",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/deposit/staff/:staffId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.read",
    "resource": null,
    "permission": "deposits.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/deposit/staff/my/logs": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.salary",
    "resource": null,
    "permission": "personal.salary",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/deposit/staff-list": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.read",
    "resource": null,
    "permission": "deposits.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/deposit/staff": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.write",
    "resource": null,
    "permission": "deposits.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/deposit/calculate/:staffDepositId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.read",
    "resource": null,
    "permission": "deposits.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/deposit/deduct": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.write",
    "resource": null,
    "permission": "deposits.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/deposit/refund/calculate/:staffDepositId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.read",
    "resource": null,
    "permission": "deposits.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/deposit/refund": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "deposits.write",
    "resource": null,
    "permission": "deposits.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/attendance-rules": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/attendance-rules/default": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/attendance-rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/attendance-rules/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/attendance-rules/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/attendance-qr/generate": {
    "legacyRoles": [
      "manager",
      "cashier",
      "admin"
    ],
    "legacyPermission": "pos.shift",
    "resource": null,
    "permission": "pos.shift",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/attendance-qr/verify": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/training/categories": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/training/categories": {
    publicationAudience:{allStaff:true},
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/training/push": {
    publicationAudience:{staffField:'staffId',allStaff:true},
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/training/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/training/my/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-correction": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-correction/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-correction": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-correction/:id/approve": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-correction/:id/reject": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/shift-swap": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": null,
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/shift-swap/colleagues": {permission:"personal.schedule",ownerOnly:false,export:false,personal:true},
  "GET /api/shift-swap/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": null,
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/shift-swap/pending-confirm": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": null,
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/shift-swap/:id/confirm": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": {
      "model": "shiftSwap",
      "param": "id"
    },
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/shift-swap": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.read",
    "resource": null,
    "permission": "schedules.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/shift-swap/:id/approve": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/shift-swap/:id/reject": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/overtime": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/overtime/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/overtime": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/overtime/:id/approve": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/overtime/:id/reject": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/shifts": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/shifts": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/shifts/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/shifts/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/shifts/seed": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "schedules.write",
    "resource": null,
    "permission": "schedules.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/insights": {
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/insights/details": {
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/insights/preferences/:productId": {
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/recipes": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/product-analysis/recipes": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.write",
    "resource": null,
    "permission": "dashboard.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/recipes/:id/cost": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/mix": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/abc": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/matrix": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/trend": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-analysis/score/:productId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/leave/apply": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.leave",
    "resource": null,
    "permission": "personal.leave",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/leave/rules": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.leave",
    "resource": null,
    "permission": "personal.leave",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/leave/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.leave",
    "resource": null,
    "permission": "personal.leave",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/leave/balance": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.leave",
    "resource": null,
    "permission": "personal.leave",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/leave/balance/:staffId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/leave/cancel/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.leave",
    "resource": null,
    "permission": "personal.leave",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/leave/list": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/leave/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/leave/approve/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/leave/reject/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/leave/balance/:staffId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/reimbursement/apply": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/reimbursement/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/reimbursement/cancel/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/reimbursement/upload": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/reimbursement/list": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reimbursement/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/reimbursement/approve/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/reimbursement/reject/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/reimbursement/mark-paid/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/leave-types": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.leave",
    "resource": null,
    "permission": "personal.leave",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/leave-types/all": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.read",
    "resource": null,
    "permission": "attendance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/leave-types": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/leave-types/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/leave-types/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/leave-types/seed": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "attendance.write",
    "resource": null,
    "permission": "attendance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/reimbursement-types": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/reimbursement-types/all": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/reimbursement-types": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/reimbursement-types/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/reimbursement-types/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/reimbursement-types/seed": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/upload/tvMusic": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/upload/product": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/upload/receipt": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/upload/attachment": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/upload/avatar": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/upload/dualScreen": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/upload/:type/:filename": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/media": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/media": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PATCH /api/media/:id": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/media/:id/references": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/media/:id": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/addons": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/addons/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "products.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/addons": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/addons/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/addons/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "products.write",
    "resource": null,
    "permission": "products.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/inventory-counts": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff",
      "cashier"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/inventory-counts/:id": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff",
      "cashier"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory-counts": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.count",
    "resource": null,
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/inventory-counts/:id/items": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff",
      "cashier"
    ],
    "legacyPermission": "inventory.count",
    "resource": null,
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/inventory-counts/:id/item/:itemId": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff",
      "cashier"
    ],
    "legacyPermission": "inventory.count",
    "resource": null,
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory-counts/:id/submit": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "inventory.count",
    "resource": null,
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory-counts/:id/complete": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.count",
    "resource": {"model":"inventoryCount","param":"id"},
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory-counts/:id/cancel": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.count",
    "resource": {"model":"inventoryCount","param":"id"},
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/inventory-counts/:id/return": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.count",
    "resource": {"model":"inventoryCount","param":"id"},
    "permission": "inventory.count",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/process-recipes": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/process-recipes/:id": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/process-recipes": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/process-recipes/:id/execute": {
    "legacyRoles": [
      "admin",
      "manager",
      "staff"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/process-recipes/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/process-recipes/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/expenses/recurring": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/expenses/recurring": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/expenses/pos": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.expense",
    "resource": null,
    "permission": "pos.expense",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/expenses/pos": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.expense",
    "resource": null,
    "permission": "pos.expense",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/expenses/categories": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/expenses/categories": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/expenses": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/expenses/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/expenses": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/expenses/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/expenses/bulk": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/expenses/export": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": true,
    "personal": false
  },
  "DELETE /api/expenses/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "finance.write",
    "resource": null,
    "permission": "finance.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/events": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.cash",
    "resource": null,
    "permission": "pos.cash",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/pos-cash/events": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.cash",
    "resource": null,
    "permission": "pos.cash",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/shifts": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.shift",
    "resource": null,
    "permission": "pos.shift",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/shifts/:id/handover": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.shift",
    "resource": null,
    "permission": "pos.shift",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/offline-work": {
    "legacyRoles": ["admin", "manager", "cashier"],
    "legacyPermission": null, "resource": null, "permission": null,
    "ownerOnly": false, "export": false, "personal": false
  },
  "POST /api/pos-cash/shifts/offline-operations": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/pos-cash/shifts/open": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.shift",
    "resource": null,
    "permission": "pos.shift",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/pos-cash/shifts/close": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.shift",
    "resource": null,
    "permission": "pos.shift",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/summary": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.cash",
    "resource": null,
    "permission": "pos.cash",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/pos-cash/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "pos.cash",
    "resource": null,
    "permission": "pos.cash",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/today": {
    "legacyRoles": [
      "admin",
      "manager",
      "cashier"
    ],
    "legacyPermission": "pos.cash",
    "resource": null,
    "permission": "pos.cash",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/areas": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hygiene/areas": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/hygiene/areas/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/hygiene/areas/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hygiene/areas/init": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/templates": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/templates/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hygiene/templates": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/hygiene/templates/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/hygiene/templates/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hygiene/templates/:id/duplicate": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hygiene/templates/seed": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/tasks": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/tasks/my/pending": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": null,
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/hygiene/tasks/my": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": null,
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/hygiene/tasks/pending": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/tasks/overdue": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/tasks/history/:staffId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hygiene/tasks/temporary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/tasks/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/hygiene/tasks/generate": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/hygiene/tasks/:id/start": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/hygiene/tasks/:id/complete": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/hygiene/tasks/:id/approve": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/hygiene/tasks/:id/skip": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/hygiene/tasks/:id/issue": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/hygiene/tasks/:id/logs": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.tasks",
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "permission": "personal.tasks",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/hygiene/stats": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/stats/range": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/stats/staff": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/categories": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/priorities": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/shifts": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/evidence-types": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/weekdays": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/frequencies": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/assigned-types": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/areas/preset": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/config": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hygiene/config/:key": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "hygiene.read",
    "resource": null,
    "permission": "hygiene.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/hygiene/config/:key": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "hygiene.write",
    "resource": null,
    "permission": "hygiene.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/bom/products": {
    "legacyRoles": ["admin"],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/bom/products/:id": {
    "legacyRoles": ["admin"],
    "legacyPermission": "inventory.read",
    "resource": {"model":"product","param":"id"},
    "permission": "inventory.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/bom/materials/usage": {
    "legacyRoles": ["admin"],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/bom/materials/low-stock-alert": {
    "legacyRoles": ["admin"],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/bom/recipes/:productId/cost": {
    "legacyRoles": ["admin"],
    "legacyPermission": "inventory.read",
    "resource": {"model":"product","param":"productId"},
    "permission": "inventory.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/bom/inventory/:inventoryId/breakdown": {
    "legacyRoles": ["admin"],
    "legacyPermission": "inventory.read",
    "resource": {"model":"inventory","param":"inventoryId"},
    "permission": "inventory.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/material/types": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/material": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/material/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material/alerts/low-stock": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material/alerts/expiry": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material/suggestions/restock": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/material/process/:recipeId/execute": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.write",
    "resource": null,
    "permission": "inventory.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material/process/history": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/material/process/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "inventory.read",
    "resource": null,
    "permission": "inventory.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/salaries/adjustments": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "rewards.read",
    "resource": null,
    "permission": "rewards.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/salaries/adjustments": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/salaries/adjustments/:adjustmentId/cancel": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "rewards.write",
    "resource": null,
    "permission": "rewards.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/salaries": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.read",
    "resource": null,
    "permission": "salary.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/salaries/prepare-month": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.write",
    "resource": null,
    "permission": "salary.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/salaries": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "salary.write",
    "resource": null,
    "permission": "salary.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/salaries/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.write",
    "resource": {
      "model": "salary",
      "param": "id"
    },
    "permission": "salary.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/salaries/:id/mark-paid": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "salary.write",
    "resource": {
      "model": "salary",
      "param": "id"
    },
    "permission": "salary.pay",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/salaries/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "salary.write",
    "resource": {
      "model": "salary",
      "param": "id"
    },
    "permission": "salary.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/salaries/deposit-plan/:staffId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.read",
    "resource": null,
    "permission": "salary.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/salaries/calculate/:staffId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "salary.read",
    "resource": null,
    "permission": "salary.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/channels": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "channels.read",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/channels/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "channels.read",
    "resource": null,
    "permission": "channels.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/channels": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "channels.write",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/channels/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "channels.write",
    "resource": null,
    "permission": "channels.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/channels/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "channels.write",
    "resource": null,
    "permission": "channels.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/channels/:id/products": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "channels.read",
    "resource": null,
    "permission": "channels.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/channels/:id/products/:productId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "channels.write",
    "resource": null,
    "permission": "channels.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/channels/:id/products/all": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "channels.read",
    "resource": null,
    "permission": "channels.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/channels/:id/products/bulk": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "channels.write",
    "resource": null,
    "permission": "channels.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/channels/:id/products/adjust": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "channels.write",
    "resource": null,
    "permission": "channels.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/channels/:id/orders": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "channels.read",
    "resource": null,
    "permission": "channels.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/delivery/platforms": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "channels.read",
    "resource": null,
    "permission": "channels.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-price/:productId/price": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "prices.write",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/product-price/:productId/channels": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "prices.write",
    "resource": null,
    "permission": "products.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/product-price/:productId/channels/:channelId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "prices.write",
    "resource": null,
    "permission": "prices.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/referrals": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/referrals": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/referrals/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/referrals/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/referrals/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/referrals/:id/stats": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/referrals/apply": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/campaign-categories": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/campaign-categories/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/campaign-categories": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/campaign-categories/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/campaign-categories/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/campaign-categories/seed": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/tier-benefits": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/tier-benefits": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/tier-benefits/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/tier-benefits/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/tier-benefits/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/tier-benefits/level/:level": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/points-expiry-rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/points-expiry-rules": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/points-expiry-rules/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/points-expiry-rules/process": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/channels": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/channels/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/channels/:id/members": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/channels/stats/attribution": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/marketing/channels": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/marketing/channels/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/marketing/channels/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/analytics/roi": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/analytics/campaigns/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/marketing/analytics/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/notifications": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.messages",
    "resource": null,
    "permission": "personal.messages",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/notifications": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/notifications/:id/read": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.messages",
    "resource": null,
    "permission": "personal.messages",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/notifications/mark-all-read": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.messages",
    "resource": null,
    "permission": "personal.messages",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/messages/channels": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "notifications.read",
    "resource": null,
    "permission": "notifications.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/messages/channels": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/messages/channels/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/messages/channels/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/messages/templates": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "notifications.read",
    "resource": null,
    "permission": "notifications.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/messages/templates": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/messages/templates/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/messages/templates/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/messages/templates/init": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/messages/variables": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "notifications.read",
    "resource": null,
    "permission": "notifications.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/messages/logs": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "notifications.read",
    "resource": null,
    "permission": "notifications.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/messages/stats": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "notifications.read",
    "resource": null,
    "permission": "notifications.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/messages/send": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/messages/broadcast": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/points-rules": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/points-rules": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/rewards": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/rewards/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/rewards": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/rewards/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/rewards/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/rewards/:id/redeem": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/rewards/member/:memberId": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.read",
    "resource": null,
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "PUT /api/rewards/use/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "marketing.write",
    "resource": null,
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/query-options": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/query": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "finance.read",
    "resource": null,
    "permission": "finance.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/handover-receipts": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/purchase-hours": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/by-channel": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/summary": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/revenue/daily": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "dashboard.read",
    "resource": null,
    "permission": "dashboard.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/payments/evidence": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.create",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/payments/evidence/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/payments/order/:orderId/evidence": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/payments/qris/create": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.create",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/payments/qris/webhook": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.create",
    "resource": null,
    "permission": "orders.create",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/payments/qris/status/:externalId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "orders.read",
    "resource": null,
    "permission": "orders.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/ai/permissions/:storeId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/ai/permissions/:storeId": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/ai/execute": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/staff-work/my/files": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/files/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/compensation": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.rewards",
    "resource": null,
    "permission": "personal.rewards",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/late-rule": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/attendance": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-work/my/appeals": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/profile-submissions": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-work/my/profile-submissions": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/learning": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff-work/my/learning": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/checklist": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff-work/my/checklist": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/admin": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-work/admin/:kind/:id/review": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-work/admin/payroll-retry": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/staff-work/admin/rule-preview": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/staff-work/admin/rule": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__administrator_only__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/staff-work/my/push-key": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff-work/my/subscription": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "DELETE /api/staff-work/my/subscription": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-work/my/dashboard": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.profile",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-permissions/me": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-permissions/stores": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-permissions": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff-permissions": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/preview": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/activate": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/approval-pin": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-permissions/approvers": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-permissions/approvals": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/staff-permissions/approvals/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/approvals": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/approvals/:id/approve": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/approvals/:id/reject": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/staff-permissions/approvals/:id/onsite": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "personal.profile",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/announcement": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "personal.messages",
    "resource": null,
    "permission": "personal.messages",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "POST /api/announcement": {
    publicationAudience:{allStaff:true},
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "DELETE /api/announcement/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/announcement/:id": {
    publicationAudience:{allStaff:true},
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "notifications.write",
    "resource": null,
    "permission": "notifications.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/announcement/active": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.messages",
    "resource": null,
    "permission": "personal.messages",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/announcement/hygiene/pending": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "notifications.read",
    "resource": null,
    "permission": "notifications.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/hardware/printers": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hardware/printers": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/hardware/detect": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/hardware/detect": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": null,
    "resource": null,
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/hardware/test-print": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/hardware/test-drawer": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "__unclassified__",
    "resource": null,
    "permission": "owner.only",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/training/library": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/training/library/edit": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.read",
    "resource": null,
    "permission": "training.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/training/library/history": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.read",
    "resource": null,
    "permission": "training.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/training/library/history/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.read",
    "resource": null,
    "permission": "training.read",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/training/library/draft": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/training/library/restore/:id": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/training/library/publish": {
    publicationAudience:{allStaff:true},
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/training/library/videos": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/training/library/videos/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "training.read",
    "resource": null,
    "permission": "training.read",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/training/library/documents": {
    "legacyRoles": [
      "admin"
    ],
    "legacyPermission": "training.write",
    "resource": null,
    "permission": "training.write",
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "GET /api/training/library/documents/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.training",
    "resource": null,
    "permission": "personal.training",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "GET /api/pos-cash/balance": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "pos.cash",
    "resource": null,
    "permission": "pos.cash",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "GET /api/pos-cash/shifts/current": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "pos.shift",
    "resource": null,
    "permission": "pos.shift",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/tv/pair/request": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/pair/check/:id": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/pair/claim": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/device/content": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/device/events": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/device/heartbeat": {
    "permission": null,
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/screens": {
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/options": {
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/defaults": {
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "PUT /api/tv/defaults": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/screens": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "PUT /api/tv/screens/:id": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "DELETE /api/tv/screens/:id": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/screens/:id/push": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/screens/:id/preview": {
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/devices/:id/revoke": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/devices/:id/interactive": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/display/:code": {
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "GET /api/tv/legacy": {
    "permission": "marketing.read",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "POST /api/tv/legacy/import": {
    "permission": "marketing.write",
    "ownerOnly": false,
    "export": false,
    "personal": false,
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": null,
    "resource": null
  },
  "PUT /api/staff-correction/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/staff-correction/:id/withdraw": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/overtime/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/overtime/:id/withdraw": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.attendance",
    "resource": null,
    "permission": "personal.attendance",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/shift-swap/:id": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": null,
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/shift-swap/:id/withdraw": {
    "legacyRoles": [
      "manager",
      "cashier",
      "staff"
    ],
    "legacyPermission": "personal.schedule",
    "resource": null,
    "permission": "personal.schedule",
    "ownerOnly": false,
    "export": false,
    "personal": true
  },
  "PUT /api/purchase-orders/:id": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/purchase-orders/:id/reverse-receipt": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "purchases.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/purchase-orders/:id/refund": {
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "legacyPermission": "purchases.write",
    "resource": {
      "model": "purchaseOrder",
      "param": "id"
    },
    "permission": "finance.write",
    "ownerOnly": false,
    "export": false,
    "personal": false
  },
  "POST /api/finance/accounts/transfers/:id/reverse": {
    "permission": "finance.write",
    "legacyPermission": "finance.write",
    "legacyRoles": [
      "admin"
    ],
    "resource": null,
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/deposit/staff/:id": {
    "permission": "deposits.write",
    "legacyPermission": "deposits.write",
    "legacyRoles": [
      "admin"
    ],
    "resource": {
      "model": "staffDeposit",
      "param": "id"
    },
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "POST /api/deposit/staff/:id/reverse/:kind/:logId": {
    "permission": "deposits.write",
    "legacyPermission": "deposits.write",
    "legacyRoles": [
      "admin"
    ],
    "resource": {
      "model": "staffDeposit",
      "param": "id"
    },
    "ownerOnly": true,
    "export": false,
    "personal": false
  },
  "PUT /api/hygiene/tasks/:id": {
    "permission": "hygiene.write",
    "legacyPermission": "hygiene.write",
    "legacyRoles": [
      "admin",
      "manager"
    ],
    "resource": {
      "model": "hygieneTask",
      "param": "id"
    },
    "ownerOnly": false,
    "export": false,
    "personal": false
  }
}
