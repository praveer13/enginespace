// The zod schemas (ARCHITECTURE §4 and §9.6): content, claims, the course lock, the KC graph, and the receipt, bundle,
// trace and challenge formats. §2.3 lists no imports for it, so the fences treat it as a leaf that imports no other
// package of ours (ESLint and verify:boundaries). W0-T07 adds the content, claims, lock and KC schemas and the ref
// grammar; W0-T08 adds the schema of course.yaml and the shapes of what the content compiler writes; W2-T01 adds the
// receipt, bundle, trace and challenge formats. This package builds under tsconfig.app.json.
//
// common.ts holds the field types that the schema files share, and is not re-exported.
export * from './refs'
export * from './content'
export * from './claims'
export * from './lock'
export * from './kc'
export * from './course'
export * from './compiled'
