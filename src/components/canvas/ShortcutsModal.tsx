import { HelpCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'

const SHORTCUT_GROUPS = [
  {
    title: 'Tools',
    shortcuts: [
      { keys: ['V', '2'], label: 'Select & Transform' },
      { keys: ['P', '3'], label: 'Pen (Freehand Ink)' },
      { keys: ['E', '0'], label: 'Eraser (Scrub Delete)' },
      { keys: ['H', '1'], label: 'Hand (Pan Canvas)' },
      { keys: ['G'], label: 'Function Graph' },
      { keys: ['Space'], label: 'Hold Space to Pan' },
    ],
  },
  {
    title: 'Actions & History',
    shortcuts: [
      { keys: ['⌘', 'Z'], label: 'Undo' },
      { keys: ['⌘', '⇧', 'Z'], label: 'Redo' },
      { keys: ['⌘', 'A'], label: 'Select All' },
      { keys: ['⌫', 'Del'], label: 'Delete Selected' },
      { keys: ['Esc'], label: 'Deselect / Cancel' },
    ],
  },
  {
    title: 'Navigation & Zoom',
    shortcuts: [
      { keys: ['⌘', '+'], label: 'Zoom In' },
      { keys: ['⌘', '-'], label: 'Zoom Out' },
      { keys: ['⌘', '0'], label: 'Reset Zoom (100%)' },
      { keys: ['Pinch'], label: 'Two-Finger Pinch Zoom' },
    ],
  },
  {
    title: 'Stylus & Hardware',
    shortcuts: [
      { keys: ['Barrel'], label: 'Hold Button to Erase' },
      { keys: ['Pressure'], label: 'USI / Wacom Pressure Sensitive' },
    ],
  },
]

export function ShortcutsModal() {
  const [show, setShow] = useState(inkyStore.showShortcuts)

  useEffect(() => {
    const unsub = inkyStore.subscribe(() => {
      setShow(inkyStore.showShortcuts)
    })
    return unsub
  }, [])

  return (
    <>
      {/* Floating "?" Trigger Button in Bottom Right */}
      <button
        type="button"
        title="Keyboard Shortcuts & Gestures (?)"
        onClick={() => inkyStore.setShowShortcuts(!show)}
        className="inky-ui fixed bottom-4 right-4 z-30 pointer-events-auto min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded-xl bg-white/95 backdrop-blur-md border border-black/10 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all duration-150 cursor-pointer"
        aria-label="Keyboard shortcuts"
      >
        <HelpCircle size={16} />
      </button>

      {/* Modal Backdrop and Card */}
      {show && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          className="inky-ui fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          {/* Backdrop button */}
          <button
            type="button"
            aria-label="Close shortcuts dialog"
            className="fixed inset-0 bg-black/20 backdrop-blur-xs cursor-default w-full h-full border-none p-0 m-0"
            onClick={() => inkyStore.setShowShortcuts(false)}
          />

          <div
            className="relative z-10 w-full max-w-md bg-white border border-black/10 rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.08)] p-5 overflow-hidden"
            style={{
              animation: 'modalSlideUp 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/8">
              <h2 className="text-sm font-semibold tracking-tight text-[#111111]">
                Shortcuts & Gestures
              </h2>
              <button
                type="button"
                title="Close (Esc)"
                onClick={() => inkyStore.setShowShortcuts(false)}
                className="p-1 rounded-md text-[#787774] hover:text-[#111111] hover:bg-black/5 transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Content: Clean typographic reference */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  <div className="text-[11px] font-medium text-[#787774]">{group.title}</div>
                  <div className="space-y-1">
                    {group.shortcuts.map((sc) => (
                      <div
                        key={sc.label}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="text-[#111111]">{sc.label}</span>
                        <div className="flex items-center gap-1">
                          {sc.keys.map((k) => (
                            <kbd
                              key={k}
                              className="px-1.5 py-0.5 text-[11px] font-mono text-[#111111] bg-black/[0.04] border border-black/8 rounded"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-black/8 flex items-center justify-between text-[11px] text-[#787774]">
              <span>Two-finger pinch to zoom & pan</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
