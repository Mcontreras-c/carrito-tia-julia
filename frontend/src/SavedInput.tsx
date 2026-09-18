import { useEffect, useRef, useState } from 'react'

type Props = { value: string; maxLength: number; disabled?: boolean; placeholder?: string; onSave: (value: string) => Promise<boolean> }
export default function SavedInput({ value, onSave, ...props }: Props) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(value) }, [value])
  return <input {...props} value={draft} onFocus={() => { focused.current = true }} onChange={e => setDraft(e.target.value)} onBlur={() => {
    focused.current = false
    if (draft !== value) void onSave(draft)
  }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
}
