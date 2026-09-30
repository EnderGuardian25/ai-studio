'use client'

import React, { useState } from 'react'
import { AlertTriangle, ArrowUpLeft, Loader2, MousePointerClick, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassInput } from '@/components/ui/GlassInput'
import type { ElementEditKind } from '@/lib/drafts/inlineEdit'
import type { ElementLocator } from '@/components/drafts/inlineElementEdit'

// The side panel for element mode in InlineEditModal (change 004 T24). It
// holds no request logic: every Apply goes up through onApply, and the modal
// sends one request at a time and handles the reply.

export interface ElementSelection {
  // Increments per selection. It keys the panel so the fields reset.
  id: number
  // The live element in the editor iframe. It is used for the highlight and
  // for "Select parent".
  el: Element
  // Snapshotted at selection time, before anything could change the DOM.
  locator: ElementLocator
  // Lower-case tag name, for display.
  tag: string
  isBody: boolean
  canText: boolean
  canStyle: boolean
  initial: { text: string; color: string; background: string; fontSize: string }
}

export type ElementNotice =
  | { kind: 'stale'; message: string }
  | { kind: 'busy'; message: string }
  | { kind: 'unsupported'; message: string }

interface ElementEditPanelProps {
  selection: ElementSelection | null
  // True while a request is in flight, or while the draft is busy.
  disabled: boolean
  // The kind of the request in flight, which gets the spinner.
  inFlight: ElementEditKind | null
  fieldError: { kind: ElementEditKind; message: string } | null
  notice: ElementNotice | null
  onApply: (kind: ElementEditKind, value: string) => void
  onSelectParent: () => void
  onClearSelection: () => void
  onCheckAgain: () => void
  onUseWholeDocument: () => void
}

const LABEL = 'text-sm font-medium text-light-text dark:text-dark-text'
const MUTED = 'text-xs text-light-text-muted dark:text-dark-text-muted'

export function ElementEditPanel({
  selection,
  disabled,
  inFlight,
  fieldError,
  notice,
  onApply,
  onSelectParent,
  onClearSelection,
  onCheckAgain,
  onUseWholeDocument,
}: ElementEditPanelProps) {
  return (
    <aside
      aria-label="Element editor"
      className="flex flex-col gap-4 rounded-xl glass-panel p-4 overflow-y-auto"
    >
      {notice && (
        <NoticeBanner notice={notice} onCheckAgain={onCheckAgain} onUseWholeDocument={onUseWholeDocument} />
      )}

      {selection ? (
        <SelectionFields
          key={selection.id}
          selection={selection}
          disabled={disabled}
          inFlight={inFlight}
          fieldError={fieldError}
          onApply={onApply}
          onSelectParent={onSelectParent}
          onClearSelection={onClearSelection}
        />
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
            <MousePointerClick size={18} />
          </span>
          <p className="text-sm font-medium text-light-text dark:text-dark-text">Select an element</p>
          <p className={MUTED}>
            Click any part of the design to change its text, colour or size. Each change saves as a
            new revision.
          </p>
        </div>
      )}
    </aside>
  )
}

function NoticeBanner({
  notice,
  onCheckAgain,
  onUseWholeDocument,
}: {
  notice: ElementNotice
  onCheckAgain: () => void
  onUseWholeDocument: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
    >
      <p className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>{notice.message}</span>
      </p>
      {notice.kind === 'busy' && (
        <Button variant="secondary" size="sm" className="self-start" onClick={onCheckAgain}>
          <RefreshCw size={12} /> Check again
        </Button>
      )}
      {notice.kind === 'unsupported' && (
        <Button variant="secondary" size="sm" className="self-start" onClick={onUseWholeDocument}>
          Use the whole-document editor
        </Button>
      )}
    </div>
  )
}

function SelectionFields({
  selection,
  disabled,
  inFlight,
  fieldError,
  onApply,
  onSelectParent,
  onClearSelection,
}: Omit<ElementEditPanelProps, 'selection' | 'notice' | 'onCheckAgain' | 'onUseWholeDocument'> & {
  selection: ElementSelection
}) {
  const [text, setText] = useState(selection.initial.text)
  const errorFor = (kind: ElementEditKind) => (fieldError?.kind === kind ? fieldError.message : undefined)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-light-text dark:text-dark-text">Selected</span>
          <span
            data-testid="element-tag"
            className="rounded-full border border-primary/20 dark:border-primary-light/25 bg-primary/10 dark:bg-primary-light/10 px-2 py-0.5 font-mono text-xs text-primary dark:text-primary-light"
          >
            &lt;{selection.tag}&gt;
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectParent}
            disabled={selection.isBody}
            title="Select the element that contains this one"
          >
            <ArrowUpLeft size={12} /> Parent
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection} aria-label="Clear selection">
            <X size={12} />
          </Button>
        </div>
      </div>

      {selection.canText ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="element-text" className={LABEL}>
            Text
          </label>
          <textarea
            id="element-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            disabled={disabled}
            className="glass-input w-full resize-y rounded-xl px-3 py-2 text-sm text-light-text dark:text-dark-text focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <FieldError message={errorFor('text')} />
          <ApplyButton
            label="Apply text"
            busy={inFlight === 'text'}
            disabled={disabled}
            onClick={() => onApply('text', text)}
          />
        </div>
      ) : (
        <p className={MUTED}>
          This element contains other elements, so its text can&apos;t be replaced as one piece.
          Click the words themselves, or use the whole-document editor.
        </p>
      )}

      {selection.canStyle && (
        <>
          <ColorField
            kind="color"
            label="Text colour"
            initial={selection.initial.color}
            disabled={disabled}
            busy={inFlight === 'color'}
            error={errorFor('color')}
            onApply={onApply}
          />
          <ColorField
            kind="backgroundColor"
            label="Background"
            initial={selection.initial.background}
            disabled={disabled}
            busy={inFlight === 'backgroundColor'}
            error={errorFor('backgroundColor')}
            onApply={onApply}
          />
          <SizeField
            initial={selection.initial.fontSize}
            disabled={disabled}
            busy={inFlight === 'fontSize'}
            error={errorFor('fontSize')}
            onApply={onApply}
          />
        </>
      )}
    </div>
  )
}

function ColorField({
  kind,
  label,
  initial,
  disabled,
  busy,
  error,
  onApply,
}: {
  kind: 'color' | 'backgroundColor'
  label: string
  initial: string
  disabled: boolean
  busy: boolean
  error: string | undefined
  onApply: (kind: ElementEditKind, value: string) => void
}) {
  const [value, setValue] = useState(initial)
  const id = `element-${kind}`
  // The swatch shows the typed value when it is a plain hex. The server's
  // grammar is the authority on what is accepted.
  const swatch = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : '#000000'
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={swatch}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-light-border dark:border-dark-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="min-w-0 flex-1">
          <GlassInput
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="#0284c7 or rgb(2, 132, 199)"
            spellCheck={false}
            disabled={disabled}
            className="font-mono"
          />
        </div>
      </div>
      <FieldError message={error} />
      <ApplyButton
        label={`Apply ${label.toLowerCase()}`}
        busy={busy}
        disabled={disabled || !value.trim()}
        onClick={() => onApply(kind, value)}
      />
    </div>
  )
}

function SizeField({
  initial,
  disabled,
  busy,
  error,
  onApply,
}: {
  initial: string
  disabled: boolean
  busy: boolean
  error: string | undefined
  onApply: (kind: ElementEditKind, value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="element-fontSize" className={LABEL}>
        Font size
      </label>
      <GlassInput
        id="element-fontSize"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="48px"
        spellCheck={false}
        disabled={disabled}
        className="font-mono"
      />
      <p className={MUTED}>px, pt, em, rem or %</p>
      <FieldError message={error} />
      <ApplyButton
        label="Apply font size"
        busy={busy}
        disabled={disabled || !value.trim()}
        onClick={() => onApply('fontSize', value)}
      />
    </div>
  )
}

function ApplyButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button variant="secondary" size="sm" className="self-start" onClick={onClick} disabled={disabled}>
      {busy && <Loader2 size={12} className="animate-spin" />}
      {label}
    </Button>
  )
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}
