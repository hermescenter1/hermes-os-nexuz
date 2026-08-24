// FIXTURE — a barrel that re-exports the bridge. `export * from` is a real
// runtime edge: whatever imports this barrel pulls the bridge in with it, which
// is exactly how a server-only module ends up in a client bundle without any
// component ever naming it.
export * from "@/lib/industrial-knowledge/runtime/bridge";
