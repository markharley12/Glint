// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Guard } from './Guard.tsx'

function Boom(): never {
  throw new Error('kaboom')
}

describe('Guard', () => {
  afterEach(cleanup)

  it('shows its children when nothing goes wrong', () => {
    render(
      <Guard>
        <p>fine</p>
      </Guard>,
    )
    expect(screen.getByText('fine')).toBeTruthy()
  })

  it('catches a render error and offers a way out', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onReset = vi.fn()
    render(
      <Guard onReset={onReset}>
        <Boom />
      </Guard>,
    )
    expect(screen.getByRole('alert').textContent).toContain('kaboom')
    fireEvent.click(screen.getByText('Carry on'))
    expect(onReset).toHaveBeenCalled()
    quiet.mockRestore()
  })
})
