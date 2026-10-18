'use client'

import { useEffect, useState } from 'react'
import { inkyStore } from '../../lib/canvas/store'

const SHORTCUT_GROUPS = [
  {
    title: 'Tools',
    shortcuts: [
      { keys: ['H', '1'], description: 'Hand' },
      { keys: ['V', '2'], description: 'Select' },
      { keys: ['P', '3'], description: 'Draw' },
      { keys: ['L', '4'], description: 'Line' },
      { keys: ['A', '5'], description: 'Arrow' },
      { keys: ['R', '6'], description: 'Rectangle' },
      { keys: ['O', '7'], description: 'Ellipse' },
      { keys: ['T', '8'], description: 'Text' },
      { keys: ['S', '9'], description: 'Sticky' },
      { keys: ['G'], description: 'Desmos' },
      { keys: ['E', '0'], description: 'Eraser' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'Z'], description: 'Undo' },
      { keys: ['⌘', '⇧', 'Z'], description: 'Redo' },
      { keys: ['⌫'], description: 'Delete selected' },
      { keys: ['⌘', 'A'], description: 'Select all' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Scroll'], description: 'Pan canvas' },
      { keys: ['⌘', 'Scroll'], description: 'Zoom in / out' },
      { keys: ['⌘', '+'], description: 'Zoom in' },
      { keys: ['⌘', '-'], description: 'Zoom out' },
      { keys: ['⌘', '0'], description: 'Reset zoom' },
      { keys: ['Space', 'Drag'], description: 'Pan (hold space)' },
    ],
  },
  {
    title: 'Other',
    shortcuts: [
      { keys: ['?'], description: 'Show help' },
      { keys: ['Esc'], description: 'Deselect / Close' },
    ],
  },
]

export function ShortcutsModal() {
  const [show, setShow] = useState(inkyStore.showShortcuts)

  useEffect(() => {
    const unsubscribe = inkyStore.subscribe(() => {
      setShow(inkyStore.showShortcuts)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  if (!show) return null

  return (
    <div
      className="inky-ui"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 150ms ease both',
      }}
      onClick={() => inkyStore.setShowShortcuts(false)}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          borderRadius: '20px',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
          padding: '28px 32px',
          maxWidth: '640px',
          width: '90vw',
          maxHeight: '80vh',
          overflow: 'auto',
          animation: 'modalSlideUp 250ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: '#1e293b',
              letterSpacing: '-0.02em',
            }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => inkyStore.setShowShortcuts(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              color: '#64748b',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            ESC
          </button>
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#6366f1',
                }}
              >
                {group.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        color: '#475569',
                      }}
                    >
                      {shortcut.description}
                    </span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {shortcut.keys.map((key, i) => (
                        <kbd
                          key={i}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '24px',
                            height: '24px',
                            padding: '0 6px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            background: 'rgba(0,0,0,0.05)',
                            border: '1px solid rgba(0,0,0,0.1)',
                            color: '#64748b',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
