/**
 * Minimal ambient declarations for the subset of the Figma Plugin API that this
 * plugin actually uses. Transcribed from the official standalone Plugin API
 * typings so `tsc --checkJs` can validate our usage WITHOUT installing the
 * `@figma/plugin-typings` package (keeping this tool dependency-free).
 *
 * This is intentionally a partial surface. Anything not modelled here resolves
 * to `any`, which is acceptable for a build-time sanity check.
 */

interface RGB { r: number; g: number; b: number }
interface RGBA { r: number; g: number; b: number; a: number }
interface FontName { family: string; style: string }

interface SolidPaint {
  type: 'SOLID'
  color: RGB
  opacity?: number
  boundVariables?: Record<string, unknown>
}
type Paint = SolidPaint | { type: string; [k: string]: unknown }

interface DropShadowEffect {
  type: 'DROP_SHADOW'
  color: RGBA
  offset: { x: number; y: number }
  radius: number
  spread?: number
  visible: boolean
  blendMode: string
}
type Effect = DropShadowEffect | { type: string; [k: string]: unknown }

interface PluginDataMixin {
  getSharedPluginData(namespace: string, key: string): string
  setSharedPluginData(namespace: string, key: string, value: string): void
  getSharedPluginDataKeys(namespace: string): string[]
}

interface BaseNode extends PluginDataMixin {
  readonly id: string
  name: string
  readonly type: string
  remove(): void
}

interface SceneNode extends BaseNode {
  visible: boolean
  fills: readonly Paint[] | typeof figmaMixed
  strokes: readonly Paint[]
  strokeWeight: number | typeof figmaMixed
  opacity: number
  effects: readonly Effect[]
  cornerRadius: number | typeof figmaMixed
  resize(width: number, height: number): void
  readonly width: number
  readonly height: number
  x: number
  y: number
  layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL'
  layoutSizingVertical: 'FIXED' | 'HUG' | 'FILL'
  layoutAlign: string
  layoutGrow: number
  setFillStyleIdAsync(styleId: string): Promise<void>
  setStrokeStyleIdAsync(styleId: string): Promise<void>
  setEffectStyleIdAsync(styleId: string): Promise<void>
  setBoundVariable(field: string, variable: Variable | null): void
  description?: string
  [k: string]: unknown
}

interface ChildrenMixin {
  readonly children: readonly SceneNode[]
  appendChild(child: SceneNode): void
  insertChild(index: number, child: SceneNode): void
  findChildren(cb: (n: SceneNode) => boolean): SceneNode[]
}

interface FrameNode extends SceneNode, ChildrenMixin {
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  primaryAxisSizingMode: 'FIXED' | 'AUTO'
  counterAxisSizingMode: 'FIXED' | 'AUTO'
  primaryAxisAlignItems: string
  counterAxisAlignItems: string
  itemSpacing: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
  clipsContent: boolean
  setEffectStyleIdAsync(styleId: string): Promise<void>
}

interface ComponentNode extends FrameNode {
  description: string
  addComponentProperty(name: string, type: string, defaultValue: unknown): string
  readonly componentPropertyDefinitions: Record<string, unknown>
}

interface ComponentSetNode extends FrameNode {
  description: string
  readonly componentPropertyDefinitions: Record<string, unknown>
}

interface TextNode extends SceneNode {
  characters: string
  fontName: FontName | typeof figmaMixed
  fontSize: number | typeof figmaMixed
  textAutoResize: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'
  textAlignHorizontal: string
  setTextStyleIdAsync(styleId: string): Promise<void>
  setRangeFontName(start: number, end: number, font: FontName): void
}

interface PageNode extends BaseNode, ChildrenMixin {
  selection: readonly SceneNode[]
}

interface Variable extends PluginDataMixin {
  readonly id: string
  name: string
  description: string
  scopes: string[]
  readonly resolvedType: 'BOOLEAN' | 'COLOR' | 'FLOAT' | 'STRING'
  readonly valuesByMode: Record<string, unknown>
  setValueForMode(modeId: string, value: unknown): void
  remove(): void
}

interface VariableCollection extends PluginDataMixin {
  readonly id: string
  name: string
  readonly modes: { modeId: string; name: string }[]
  readonly defaultModeId: string
  readonly variableIds: string[]
  addMode(name: string): string
  renameMode(modeId: string, newName: string): void
  remove(): void
}

interface BaseStyle extends PluginDataMixin {
  readonly id: string
  name: string
  description: string
  remove(): void
}
interface PaintStyle extends BaseStyle { paints: readonly Paint[] }
interface TextStyle extends BaseStyle {
  fontName: FontName
  fontSize: number
  lineHeight: { unit: 'PIXELS' | 'PERCENT' | 'AUTO'; value?: number }
  letterSpacing: { unit: 'PIXELS' | 'PERCENT'; value: number }
}
interface EffectStyle extends BaseStyle { effects: readonly Effect[] }

interface VariablesAPI {
  createVariableCollection(name: string): VariableCollection
  createVariable(name: string, collection: VariableCollection, resolvedType: 'BOOLEAN' | 'COLOR' | 'FLOAT' | 'STRING'): Variable
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>
  getLocalVariablesAsync(type?: string): Promise<Variable[]>
  getVariableByIdAsync(id: string): Promise<Variable | null>
  getVariableCollectionByIdAsync(id: string): Promise<VariableCollection | null>
  setBoundVariableForPaint(paint: Paint, field: string, variable: Variable): Paint
}

interface PluginAPI {
  readonly currentPage: PageNode
  readonly root: BaseNode & { readonly children: readonly PageNode[] }
  readonly mixed: unique symbol
  readonly variables: VariablesAPI
  createFrame(): FrameNode
  createComponent(): ComponentNode
  createText(): TextNode
  createRectangle(): SceneNode
  createEllipse(): SceneNode
  createSection(): SceneNode & ChildrenMixin & { name: string }
  combineAsVariants(nodes: readonly ComponentNode[], parent: BaseNode & ChildrenMixin): ComponentSetNode
  createPaintStyle(): PaintStyle
  createTextStyle(): TextStyle
  createEffectStyle(): EffectStyle
  getLocalPaintStylesAsync(): Promise<PaintStyle[]>
  getLocalTextStylesAsync(): Promise<TextStyle[]>
  getLocalEffectStylesAsync(): Promise<EffectStyle[]>
  getNodeByIdAsync(id: string): Promise<BaseNode | null>
  loadFontAsync(font: FontName): Promise<void>
  listAvailableFontsAsync(): Promise<{ fontName: FontName }[]>
  showUI(html: string, options?: Record<string, unknown>): void
  closePlugin(message?: string): void
  readonly ui: {
    postMessage(msg: unknown): void
    onmessage: ((msg: unknown) => void) | undefined
    resize(width: number, height: number): void
  }
}

declare const figma: PluginAPI
declare const figmaMixed: unique symbol
declare const __html__: string

// CommonJS globals available in Figma's classic-script sandbox and in Node,
// declared here so `tsc --checkJs` validates the source without @types/node.
declare var require: (id: string) => any
declare var module: { exports: any }
declare var exports: any
declare const __dirname: string
