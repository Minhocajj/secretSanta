import type { InjectionKey } from 'vue'
import type { SessionApi } from './sessionApi'

export const sessionApiKey: InjectionKey<SessionApi | null> = Symbol('sessionApi')
