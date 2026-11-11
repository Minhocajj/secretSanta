import { createApp } from 'vue'
import App from './App.vue'
import { createSessionApi, readBackendConfig } from './lib/backend'
import { sessionApiKey } from './lib/sessionApiKey'
import { createAppRouter } from './router'
import './styles.css'

const app = createApp(App)
app.provide(sessionApiKey, createSessionApi(readBackendConfig(import.meta.env)))
app.use(createAppRouter()).mount('#app')
