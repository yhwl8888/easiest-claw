import packageJson from "../../../../package.json"

type BugsField = string | { url?: string } | undefined

const bugsField = (packageJson as Record<string, unknown>).bugs as BugsField

export const APP_VERSION = packageJson.version
export const BUG_FEEDBACK_URL =
  typeof bugsField === "string" ? bugsField : bugsField?.url ?? null
