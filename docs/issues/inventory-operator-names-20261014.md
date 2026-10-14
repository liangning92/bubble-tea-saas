# Inventory operator names

Stock movements and purchase records stored actor IDs, but returned no staff names. The admin ledger displayed supplier name instead of operator when a supplier existed, and count pages omitted the saved countedBy identity.

The API now batch-resolves staff or historical user IDs within each record store, returning only staff ID, name and employee number. Stock movements expose operator; purchases expose createdByActor and receivedByActor; count items expose countedByActor. Missing/deleted identities remain explicitly missing, never assigned to the viewing account. Count adjustment actors are read from their existing structured audit note. Administrative adjustments use server-authenticated identity instead of a supplied staffId.

Admin stock ledger and CSV keep operator and supplier distinct. Purchase cards show purchaser/receiver. Admin and staff count rows show counter and observation time. Staff inventory retains all existing operations and adds a read-only history entry with movement/purchase operator names, search, filters, loading/empty/error states.

Validation: admin/staff/API TypeScript, builds/translations, scoped CI, store-bound actor resolver tests; real historical movements and isolated saved operation workflows; desktop/tablet/phone checks. No schema migration. Release only API/admin/staff and preserve POS and other deployed fixes.
