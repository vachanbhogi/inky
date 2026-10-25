// Bun test preload: register a DOM so component behavior (StampLayer wipe,
// layout effects) can be asserted for real instead of via source scans.
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { plugin } from 'bun'

GlobalRegistrator.register()

// Vite transforms `?worker` imports to Worker constructors. In Bun test, provide
// the same stub constructor so files importing workers can be unit-tested.
plugin({
  name: 'worker-loader',
  setup(build) {
    build.onLoad({ filter: /\?worker$/ }, () => ({
      contents: `export default class MockWorker {
        onmessage = null
        onerror = null
        postMessage() {}
        terminate() {}
      }`,
      loader: 'js',
    }))
  },
})
