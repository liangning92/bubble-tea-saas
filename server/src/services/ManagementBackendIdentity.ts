// A Symbol cannot arrive in HTTP headers, JSON, URL parameters or model arguments.
// Only the in-process dispatcher may attest an already verified requesting user.
export const MANAGEMENT_BACKEND_IDENTITY = Symbol('verified backend account delegation')
