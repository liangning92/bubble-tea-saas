import { forwardRef, type ComponentProps } from 'react'
import { LocalizedDateTimeInput as SharedDateTimeInput } from '../../../shared/components/LocalizedDateTimeInput'
import { useAdminDialogDirty } from './AdminDialog'

// Calendar selections call onChange directly, so the dialog capture handler cannot observe them.
export const LocalizedDateTimeInput = forwardRef<HTMLInputElement, ComponentProps<typeof SharedDateTimeInput>>(
  function LocalizedDateTimeInput({ onChange, value, defaultValue, ...props }, ref) {
    const markDirty = useAdminDialogDirty()
    return <SharedDateTimeInput {...props} ref={ref} value={value} defaultValue={defaultValue} onChange={event => {
      if (String(event.target.value) !== String(value ?? defaultValue ?? '')) markDirty()
      onChange?.(event)
    }} />
  },
)
