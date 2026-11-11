<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import type { SecretSanta } from '../composables/useSecretSanta'
import { MIN_PARTICIPANTS } from '../lib/validation'
import DeliveryReport from './DeliveryReport.vue'
import DiceIcon from './DiceIcon.vue'
import ResultsList from './ResultsList.vue'

const props = defineProps<{ santa: SecretSanta }>()

const {
  canSend,
  participants,
  showResults,
  phase,
  pairs,
  deliveries,
  failedCount,
  canRoll,
  hasUndeliveredDraw,
  roll,
  reroll,
  confirm,
  retryFailed,
  backToEdit,
  startOver,
} = props.santa

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (hasUndeliveredDraw.value) event.preventDefault()
}

function confirmStartOver() {
  const discard =
    failedCount.value === 0 ||
    window.confirm('Some emails were not delivered. Starting over discards the draw, so those people will never receive their match. Start over anyway?')
  if (discard) startOver()
}

onMounted(() => window.addEventListener('beforeunload', warnBeforeLeaving))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeLeaving))
</script>

<template>
  <section v-if="phase === 'edit'" class="card" aria-labelledby="roll-title">
    <h2 id="roll-title">Roll the dice</h2>
    <label class="check">
      <input v-model="showResults" type="checkbox" />
      <span>Show results to me</span>
    </label>
    <p class="muted">
      {{
        showResults
          ? 'You will see who is Santa for whom, can re-roll as often as you like, and then confirm to send the emails.'
          : 'The draw happens silently and the emails go out right away. Nobody, including you, sees the result.'
      }}
    </p>
    <button type="button" class="btn btn--primary btn--large" :disabled="!canRoll" @click="roll">
      <DiceIcon /> Roll the dice
    </button>
    <p v-if="participants.length < MIN_PARTICIPANTS" class="muted">
      Add at least {{ MIN_PARTICIPANTS }} participants to roll.
    </p>
    <p v-else-if="!canRoll && !canSend" class="muted">
      Sending is not configured. Check "Show results to me" to preview a draw.
    </p>
  </section>

  <section v-else-if="phase === 'review'" class="card" aria-labelledby="results-title">
    <h2 id="results-title">Who is Santa for whom</h2>
    <ResultsList :pairs="pairs" />
    <div class="actions">
      <button type="button" class="btn btn--secondary" @click="reroll"><DiceIcon /> Re-roll</button>
      <button type="button" class="btn btn--primary" :disabled="!canSend" @click="confirm">
        Confirm and send emails
      </button>
      <button type="button" class="btn btn--ghost" @click="backToEdit">Back to participants</button>
    </div>
    <p v-if="!canSend" class="muted">Configure EmailJS to enable sending.</p>
  </section>

  <template v-else>
    <section v-if="pairs.length" class="card" aria-labelledby="results-title">
      <h2 id="results-title">Who is Santa for whom</h2>
      <ResultsList :pairs="pairs" />
    </section>

    <section class="card" aria-labelledby="delivery-title">
      <h2 id="delivery-title">{{ phase === 'sending' ? 'Sending emails...' : 'Emails' }}</h2>
      <DeliveryReport :deliveries="deliveries" />
      <div v-if="phase === 'done'" class="actions">
        <button v-if="failedCount" type="button" class="btn btn--primary" @click="retryFailed">
          Retry failed ({{ failedCount }})
        </button>
        <button type="button" class="btn btn--secondary" @click="confirmStartOver">Start over</button>
      </div>
    </section>
  </template>
</template>
