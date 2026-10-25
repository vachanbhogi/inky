// Bun test preload: register a DOM so component behavior (StampLayer wipe,
// layout effects) can be asserted for real instead of via source scans.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
