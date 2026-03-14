import type { AppState, AppAction } from "./app-types"
import { handleFleetAction } from "./reducers/fleet"
import { handleGroupAction } from "./reducers/groups"
import { handleChatAction } from "./reducers/chat"

export function appReducer(state: AppState, action: AppAction): AppState {
  return (
    handleFleetAction(state, action) ??
    handleGroupAction(state, action) ??
    handleChatAction(state, action) ??
    state
  )
}
