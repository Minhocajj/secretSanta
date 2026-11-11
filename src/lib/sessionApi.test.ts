import { describe, expect, it } from 'vitest'
import { SessionApiError, toFormErrors } from './sessionApi'
import { UNEXPECTED_FORM_ERROR } from './validation'

describe('SessionApiError', () => {
  it('carries a code, field messages and a readable default message', () => {
    const error = new SessionApiError('closed')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SessionApiError')
    expect(error.code).toBe('closed')
    expect(error.fields).toEqual({})
    expect(error.message).toBe('This session is closed')
  })
})

describe('toFormErrors', () => {
  it('maps participant field messages to their fields', () => {
    const error = new SessionApiError('invalid', { email: 'This email is already on the list', gift: 'Too long' })

    expect(toFormErrors(error)).toEqual({ email: 'This email is already on the list', gift: 'Too long' })
  })

  it('shows state errors such as a closed session on the form itself', () => {
    expect(toFormErrors(new SessionApiError('closed'))).toEqual({ form: 'This session is closed' })
    expect(toFormErrors(new SessionApiError('full'))).toEqual({ form: new SessionApiError('full').message })
  })

  it('falls back to the error message when no participant field is affected', () => {
    const error = new SessionApiError('invalid', { title: 'Title is required' })

    expect(toFormErrors(error)).toEqual({ form: error.message })
  })

  it('does not leak details of unexpected errors', () => {
    expect(toFormErrors(new Error('connect ECONNREFUSED 10.0.0.1'))).toEqual({ form: UNEXPECTED_FORM_ERROR })
    expect(toFormErrors('boom')).toEqual({ form: UNEXPECTED_FORM_ERROR })
  })
})
