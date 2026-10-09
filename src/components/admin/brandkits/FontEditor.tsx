'use client'

import React, { useEffect, useRef, useState } from 'react'
import { GOOGLE_FONTS, googleFontsUrl } from './googleFonts'
import { fieldClasses, fieldEdge } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { FOCUS } from '@/components/ui/folio'

// ─── Font Editor ─────────────────────────────────────────────────────────────
// Includes an inline Google Fonts combobox (search + keyboard nav) — there is
// no separate combobox subcomponent in the source; the search/select UI is
// part of FontEditor itself.

interface FontEntry {
  name: string
  url: string
}

interface FontEditorProps {
  fonts: FontEntry[]
  onChange: (f: FontEntry[]) => void
}

export function FontEditor({ fonts, onChange }: FontEditorProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listboxId = React.useId()

  const matches = query.trim()
    ? GOOGLE_FONTS.filter(f => f.toLowerCase().includes(query.toLowerCase()) && !fonts.find(x => x.name === f))
    : []
  const visible = matches.slice(0, 8)
  const expanded = open && visible.length > 0

  function add(name: string) {
    onChange([...fonts, { name, url: googleFontsUrl(name) }])
    setQuery('')
    setOpen(false)
    setHighlighted(0)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!expanded) {
      if (e.key === 'ArrowDown' && visible.length > 0) {
        e.preventDefault()
        setOpen(true)
        setHighlighted(0)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => (h + 1) % visible.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => (h - 1 + visible.length) % visible.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = visible[highlighted]
      if (pick) add(pick)
    }
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {fonts.map(f => (
          <div key={f.name} className="flex max-w-full items-center gap-1.5 rounded-ui-sm border border-line-subtle bg-surface py-0.5 pl-2 pr-0.5">
            <span className="min-w-0 break-words text-ui-sm text-fg">{f.name}</span>
            <button
              type="button"
              onClick={() => onChange(fonts.filter(x => x.name !== f.name))}
              aria-label={`Remove font ${f.name}`}
              className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-ui-sm text-fg-muted transition-colors duration-fast ease-standard hover:text-status-failed ${FOCUS}`}
            >×</button>
          </div>
        ))}
      </div>
      <div ref={ref} className="relative">
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlighted(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${listboxId}-option-${highlighted}` : undefined}
          placeholder="Search Google Fonts…"
          className={cn(fieldClasses, fieldEdge())}
        />
        {expanded && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Google Fonts matches"
            className="surface-raised absolute z-20 mt-1 max-h-48 w-full overflow-y-auto py-1.5"
          >
            {visible.map((name, i) => (
              <li
                key={name}
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={i === highlighted}
              >
                <button
                  tabIndex={-1}
                  onMouseDown={e => { e.preventDefault(); add(name) }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full px-3.5 py-[7px] text-left font-text text-ui-sm text-fg transition-colors duration-fast ease-standard ${
                    i === highlighted ? 'bg-canvas' : ''
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
