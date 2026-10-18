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
      { keys: ['Barrel Btn'], label: 'Hold to Erase' },
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
        className="inky-ui fixed bottom-4 right-4 z-30 pointer-events-auto min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-2xl bg-white/95 backdrop-blur-xl border border-black/8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] text-[#787774] hover:text-[#111111] hover:bg-black/5 active:scale-95 transition-all duration-150 cursor-pointer"
        aria-label="Keyboard shortcuts"
      >
        <HelpCircle size={18} />
      </button>

      {/* Modal Backdrop and Card */}
      {show && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          className="inky-ui fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop button */}
          <button
            type="button"
            aria-label="Close shortcuts dialog"
            className="fixed inset-0 bg-black/25 backdrop-blur-sm cursor-default w-full h-full border-none p-0 m-0"
            onClick={() => inkyStore.setShowShortcuts(false)}
          />

          <div
            className="relative z-10 w-full max-w-xl bg-white/95 backdrop-blur-2xl border border-black/8 rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.12)] p-6 md:p-8 overflow-hidden"
            style={{
              animation: 'modalSlideUp 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-black/8">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-[#111111]">
                  Keyboard Shortcuts & Gestures
                </h2>
                <p className="text-xs text-[#787774] mt-0.5">
                  Handwriting, gestures, and rapid whiteboard controls
                </p>
              </div>
              <button
                type="button"
                title="Close (Esc)"
                onClick={() => inkyStore.setShowShortcuts(false)}
                className="p-1.5 rounded-xl text-[#787774] hover:text-[#111111] hover:bg-black/5 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Grid of Shortcuts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[60vh] overflow-y-auto pr-1">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]/70">
                    {group.title}
                  </h3>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((sc) => (
                      <div
                        key={sc.label}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="text-[#111111] font-medium">{sc.label}</span>
                        <div className="flex items-center gap-1">
                          {sc.keys.map((k) => (
                            <kbd
                              key={k}
                              className="px-1.5 py-0.5 text-[11px] font-mono font-medium text-[#111111] bg-black/5 border border-black/8 rounded-md shadow-[0_1px_1px_rgba(0,0,0,0.05)]"
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
            <div className="mt-6 pt-4 border-t border-black/8 flex items-center justify-between text-xs text-[#787774]">
              <span>Tip: Touch with 2 fingers to zoom and pan anytime</span>
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-black/5 border border-black/8 rounded">
                Esc to close
              </kbd>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
