export type IsExpanded = boolean

declare module 'claude-code' {
  interface PluginState {
    'copy-command': { isExpanded: StateFamily<IsExpanded> }
  }
}
