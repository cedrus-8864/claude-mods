export type IsOn = boolean

declare module 'claude-code' {
  interface PluginState {
    'open-link': { isOn: boolean }
  }
}
