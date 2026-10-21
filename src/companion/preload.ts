import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"
import type { CompanionApi, CompanionView } from "./types"

const api: CompanionApi = {
  onView(cb) {
    const listener = (_e: IpcRendererEvent, view: CompanionView) => cb(view)
    ipcRenderer.on("companion:view", listener)
    return () => void ipcRenderer.removeListener("companion:view", listener)
  },
  open: (id) => ipcRenderer.send("companion:open", id),
  resize: (height) => ipcRenderer.send("companion:resize", height),
  close: () => ipcRenderer.send("companion:close"),
  requestAccess: () => ipcRenderer.send("companion:access"),
}

contextBridge.exposeInMainWorld("companion", api)
