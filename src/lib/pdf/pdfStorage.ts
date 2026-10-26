import type { WorksheetPage } from '../document/boardCatalog'

const IDB_NAME = 'inky-pdf-storage-v1'
const IDB_STORE = 'pdfPages'

function openPdfIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'))
      return
    }
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'))
  })
}

export async function savePdfPagesToIdb(boardId: string, pages: WorksheetPage[]): Promise<void> {
  try {
    const db = await openPdfIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.put(pages, boardId)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch {
    // Ignore IDB errors in restricted or test environments
  }
}

export async function loadPdfPagesFromIdb(boardId: string): Promise<WorksheetPage[] | null> {
  try {
    const db = await openPdfIdb()
    return await new Promise<WorksheetPage[] | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const getReq = store.get(boardId)
      getReq.onsuccess = () => {
        db.close()
        const res = getReq.result
        resolve(Array.isArray(res) ? (res as WorksheetPage[]) : null)
      }
      getReq.onerror = () => {
        db.close()
        reject(getReq.error)
      }
    })
  } catch {
    return null
  }
}

export async function deletePdfPagesFromIdb(boardId: string): Promise<void> {
  try {
    const db = await openPdfIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.delete(boardId)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    })
  } catch {
    // Ignore IDB errors
  }
}
