/**
 * PHASE 109-C1 — Automation Engineering Studio, public surface.
 *
 * Consumers import from here rather than reaching into individual modules, so
 * the internal file layout can change without a UI edit.
 */

export {
  ALL_DATA_ORIGINS,
  ALL_DIAGNOSTIC_CODES,
  assertPermittedOrigin,
  AutomationStudioOriginError,
  AutomationStudioPathError,
  contentChecksum,
  DIAGNOSTIC_CODES,
  EDITABLE_APPROVAL_STATES,
  isEditableApprovalState,
  isLiveOrigin,
  isPermittedOrigin,
  LIVE_ORIGINS,
  normaliseArtifactPath,
  PERMITTED_ORIGINS_ROUND_1,
  PROJECT_LIMITS,
  type ApprovalState,
  type ArtifactKind,
  type AutomationProject,
  type BlockLanguage,
  type ControllerFamily,
  type ControllerTarget,
  type DataOrigin,
  type DiagnosticCode,
  type DiagnosticFinding,
  type DiagnosticSeverity,
  type EngineeringArtifact,
  type EngineeringWorkspace,
  type ProgramBlock,
  type ProjectVersion,
  type ProvenanceRecord,
  type SymbolAccess,
  type SymbolDataType,
  type SymbolDefinition,
  type SymbolReference,
  type SymbolScope,
  type TestScenario,
  type TestScenarioStatus,
  type ValidationRun,
  type WorkspaceMode,
} from "./contract";

export {
  buildDemoProject,
  DEMO_DISCLOSURE,
  DEMO_EPOCH_MS,
  DEMO_PRODUCER,
  EXPECTED_PASSING_CODES,
  SEEDED_DEFECT_CODES,
} from "./demo-project";

export {
  AVAILABLE_MODES,
  createLocalWorkspace,
  resolveWorkspaceSource,
  WORKSPACE_PROVENANCE,
  workspaceIsEditable,
  type WorkspaceSourceDescriptor,
} from "./local-adapter";

export {
  buildSymbolIndex,
  crossReference,
  definitionOf,
  duplicateSymbols,
  orphanSymbols,
  querySymbols,
  unresolvedSymbols,
  type SymbolEntry,
  type SymbolIndex,
  type SymbolQuery,
} from "./symbols";

export {
  applyEdit,
  applyEditsToBlocks,
  canEdit,
  canRedo,
  canUndo,
  currentChecksum,
  currentSource,
  dirtyArtifactIds,
  editRefusal,
  EMPTY_EDIT_MODEL,
  isDirty,
  linesOf,
  normaliseSource,
  redo,
  saveLocally,
  saveState,
  sourceOf,
  stateFor,
  undo,
  workspaceSaveState,
  type ArtifactEditState,
  type EditabilityInput,
  type EditModel,
  type EditRefusal,
  type SaveState,
} from "./edit-state";

export { countBySeverity, validateProject } from "./validation";

export {
  allFolderIds,
  buildTree,
  findingsByArtifact,
  modifiedArtifacts,
  visibleNodes,
  worstSeverity,
  type TreeNode,
  type TreeNodeKind,
} from "./selectors";
